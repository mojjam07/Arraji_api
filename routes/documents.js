const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Document, Application, User } = require('../models');
const { protect, authorize, authorizeOwnerOrAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { securityLogger, auditLogger } = require('../middleware/logger');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only images, PDFs, and Word documents are allowed.', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// All document routes require authentication
router.use(protect);

// @route   GET /api/documents
// @desc    Get user's documents
// @access  Private
router.get('/', async (req, res, next) => {
  try {
    const { applicationId, status, type } = req.query;
    
    const where = { userId: req.user.id };
    if (applicationId) where.applicationId = applicationId;
    if (status) where.status = status;
    if (type) where.documentType = type;

    const documents = await Document.findAll({
      where,
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'visaType', 'status', 'fullName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: { documents }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/documents/:id
// @desc    Get specific document
// @access  Private
router.get('/:id', [
  require('express-validator').param('id').isUUID().withMessage('Invalid document ID')
], async (req, res, next) => {
  try {
    const errors = require('express-validator').validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const document = await Document.findByPk(req.params.id, {
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'visaType', 'status', 'fullName']
        },
        {
          model: User,
          as: 'uploadedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    // Check if user owns the document or is admin/officer
    if (document.userId !== req.user.id && !['admin', 'officer'].includes(req.user.role)) {
      return next(new AppError('Not authorized to access this document', 403));
    }

    res.json({
      success: true,
      data: { document }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/documents
// @desc    Upload document
// @access  Private
router.post('/', upload.single('file'), [
  require('express-validator').body('applicationId').optional({ nullable: true }).custom((value) => {
    // Allow null, undefined, or valid UUID
    if (value === null || value === undefined || value === '' || value === 'null') {
      return true;
    }
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new Error('Valid application ID is required');
    }
    return true;
  }),
  require('express-validator').body('documentType')
    .isIn(['passport', 'passport_photo', 'passport_copy', 'photo', 'id_card', 'birth_certificate', 'marriage_certificate', 'employment_letter', 'bank_statement', 'travel_insurance', 'travel_itinerary', 'flight_itinerary', 'hotel_booking', 'invitation_letter', 'insurance_policy', 'educational_certificate', 'other'])
    .withMessage('Valid document type is required'),
  require('express-validator').body('description').optional().trim().isLength({ max: 500 })
], async (req, res, next) => {
  try {
    const errors = require('express-validator').validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.file) {
      return next(new AppError('No file uploaded', 400));
    }

    let { applicationId, documentType, description } = req.body;

    // Handle null/empty applicationId values from frontend
    if (applicationId === 'null' || applicationId === 'undefined' || applicationId === '' || applicationId === null || applicationId === undefined) {
      applicationId = null;
    }

    // Verify application belongs to user if applicationId is provided
    if (applicationId) {
      const application = await Application.findOne({
        where: { id: applicationId, userId: req.user.id }
      });

      if (!application) {
        return next(new AppError('Application not found', 404));
      }
    }

    const document = await Document.create({
      userId: req.user.id,
      applicationId: applicationId || null,
      documentType,
      fileName: req.file.originalname,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: 'pending',
      description: description || null
    });

    securityLogger.fileUpload(req.user.id, req.file.originalname, req.file.size, req.ip);
    auditLogger.userAction(req.user.id, 'upload_document', { documentId: document.id, documentType });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: { document }
    });
  } catch (error) {
    console.error('Document upload error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name
    });
    next(error);
  }
});

// @route   PUT /api/documents/:id/status
// @desc    Update document status (Admin/Officer only)
// @access  Private (Admin/Officer)
router.put('/:id/status', [
  require('express-validator').param('id').isUUID().withMessage('Invalid document ID'),
  require('express-validator').body('status')
    .isIn(['pending', 'approved', 'rejected', 'expired'])
    .withMessage('Valid status is required'),
  require('express-validator').body('rejectionReason').optional().trim().isLength({ max: 500 })
], async (req, res, next) => {
  try {
    const errors = require('express-validator').validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const document = await Document.findByPk(req.params.id, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    const { status, rejectionReason } = req.body;
    const updateData = { status };
    
    if (status === 'rejected') {
      updateData.rejectionReason = rejectionReason;
    }

    await document.update(updateData);

    // Log the document review
    auditLogger.documentReviewed(document.id, status, req.user.id);

    // Create notification for user if document is verified or rejected
    if (document.userId) {
      const { Notification } = require('../models');
      await Notification.create({
        userId: document.userId,
        applicationId: document.applicationId,
        type: status === 'verified' ? 'document_approved' : 'document_rejected',
        title: status === 'verified' ? 'Document Approved' : 'Document Rejected',
        message: status === 'verified' 
          ? `Your ${document.documentType.replace(/_/g, ' ')} has been approved.`
          : `Your ${document.documentType.replace(/_/g, ' ')} was rejected. ${rejectionReason ? 'Reason: ' + rejectionReason : ''}`,
        priority: 'medium',
        createdBy: req.user.id
      });
    }

    res.json({
      success: true,
      message: 'Document status updated successfully',
      data: { document }
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/documents/:id
// @desc    Delete document
// @access  Private
router.delete('/:id', [
  require('express-validator').param('id').isUUID().withMessage('Invalid document ID')
], async (req, res, next) => {
  try {
    const errors = require('express-validator').validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const document = await Document.findByPk(req.params.id);

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    // Check if user owns the document or is admin
    if (document.userId !== req.user.id && req.user.role !== 'admin') {
      return next(new AppError('Not authorized to delete this document', 403));
    }

    // Delete file from filesystem
    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    await document.destroy();

    auditLogger.userAction(req.user.id, 'delete_document', { documentId: req.params.id });

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/documents/admin/all
// @desc    Get all documents (Admin/Officer)
// @access  Private (Admin/Officer)
router.get('/admin/all', protect, authorize('admin', 'officer'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, documentType, applicationId, userId } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (documentType) whereClause.documentType = documentType;
    if (applicationId) whereClause.applicationId = applicationId;
    if (userId) whereClause.userId = userId;

    const { count, rows: documents } = await Document.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'visaType', 'status', 'fullName']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          total: count,
          page: parseInt(page),
          pages: Math.ceil(count / limit),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/documents/types
// @desc    Get document types
// @access  Private
router.get('/meta/types', (req, res) => {
  const types = [
    { value: 'passport_photo', label: 'Passport Photo', description: 'Recent passport-sized photograph' },
    { value: 'passport_copy', label: 'Passport Copy', description: 'Clear copy of valid passport' },
    { value: 'id_card', label: 'National ID Card', description: 'National identity card' },
    { value: 'birth_certificate', label: 'Birth Certificate', description: 'Official birth certificate' },
    { value: 'marriage_certificate', label: 'Marriage Certificate', description: 'Marriage certificate (if applicable)' },
    { value: 'employment_letter', label: 'Employment Letter', description: 'Proof of employment from employer' },
    { value: 'bank_statement', label: 'Bank Statement', description: 'Recent bank statements (3-6 months)' },
    { value: 'travel_itinerary', label: 'Travel Itinerary', description: 'Flight reservations and travel plans' },
    { value: 'hotel_booking', label: 'Hotel Booking', description: 'Hotel reservation confirmation' },
    { value: 'invitation_letter', label: 'Invitation Letter', description: 'Letter of invitation from host' },
    { value: 'insurance_policy', label: 'Travel Insurance', description: 'Travel insurance policy' },
    { value: 'educational_certificate', label: 'Educational Certificate', description: 'Educational qualifications' },
    { value: 'other', label: 'Other', description: 'Other supporting documents' }
  ];

  res.json({
    success: true,
    data: { types }
  });
});

module.exports = router;

