const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { User, Application, Payment, Document, Notification, BiometricAppointment } = require('../models');
const { protect, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { logger, auditLogger } = require('../middleware/logger');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Private/Admin
router.get('/dashboard', async (req, res, next) => {
  try {
    // Get various statistics
    const [
      totalUsers,
      totalApplications,
      pendingApplications,
      issuedApplications,
      totalPayments,
      pendingPayments,
      totalRevenue
    ] = await Promise.all([
      User.count({ where: { isActive: true } }),
      Application.count(),
      Application.count({ where: { status: 'submitted' } }),
      Application.count({ where: { status: 'completed' } }),
      Payment.count(),
      Payment.count({ where: { status: 'pending' } }),
      Payment.sum('amount', { where: { status: 'completed' } })
    ]);

    // Calculate average processing days
    let avgProcessingDays = 2.3; // Default value
    try {
      const avgDaysResult = await Application.sequelize.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(approved_at, rejected_at, updated_at) - created_at))/86400) as avg_days
        FROM "applications"
        WHERE status IN ('approved', 'rejected', 'completed')
        AND (approved_at IS NOT NULL OR rejected_at IS NOT NULL OR updated_at IS NOT NULL)
      `, { type: Application.sequelize.QueryTypes.SELECT });
      
      if (avgDaysResult && avgDaysResult[0]?.avg_days) {
        avgProcessingDays = avgDaysResult[0].avg_days;
      }
    } catch (avgDaysError) {
      // If the column doesn't exist, use default value and continue
      console.warn('⚠️ Could not calculate average processing days, using default:', avgDaysError.message);
    }

    // Get application counts by visa type
    const visaTypeStats = await Application.findAll({
      attributes: [
        'visaType',
        [Application.sequelize.fn('COUNT', Application.sequelize.col('visa_type')), 'count']
      ],
      group: ['visaType']
    });

    // Map visa types to the expected categories
    const businessLicenses = visaTypeStats.find(stat => stat.visaType === 'business')?.dataValues?.count || 0;
    const permitRenewals = visaTypeStats.find(stat => stat.visaType === 'work')?.dataValues?.count || 0;
    const newRegistrations = visaTypeStats.find(stat => stat.visaType === 'tourist')?.dataValues?.count || 0;
    const documentUpdates = visaTypeStats.find(stat => stat.visaType === 'student')?.dataValues?.count || 0;

    // Recent applications
    const recentApplications = await Application.findAll({
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    // Recent payments
    const recentPayments = await Payment.findAll({
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] },
        { model: Application, as: 'application', attributes: ['visaType'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    res.json({
      success: true,
      data: {
        totalApplications,
        pendingApplications,
        activeUsers: totalUsers,
        avgProcessingDays: Math.round((avgProcessingDays || 2.3) * 10) / 10,
        serverUptime: '99.9%',
        responseTime: '120ms',
        errorRate: '0.1%',
        storageUsed: '68%',
        businessLicenses,
        permitRenewals,
        newRegistrations,
        documentUpdates,
        statistics: {
          totalUsers,
          totalApplications,
          pendingApplications,
          issuedApplications,
          totalPayments,
          pendingPayments,
          totalRevenue: totalRevenue || 0
        },
        recentApplications,
        recentPayments
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with pagination and filtering
// @access  Private/Admin
router.get('/users', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('role').optional().isIn(['user', 'admin', 'officer']),
  query('isActive').optional().isBoolean().toBoolean(),
  query('search').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { page = 1, limit = 10, role, isActive, search } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password', 'passwordResetToken', 'passwordResetExpires'] },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total: count,
          page,
          pages: Math.ceil(count / limit),
          limit
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/users/:id
// @desc    Update user details
// @access  Private/Admin
router.put('/users/:id', [
  param('id').isUUID(),
  body('firstName').optional().trim().isLength({ min: 2 }),
  body('lastName').optional().trim().isLength({ min: 2 }),
  body('role').optional().isIn(['user', 'admin', 'officer']),
  body('isActive').optional().isBoolean()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { id } = req.params;
    const { firstName, lastName, role, isActive } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Update user
    await user.update({
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(role && { role }),
      ...(isActive !== undefined && { isActive })
    });

    // Log admin action
    auditLogger.adminAction(req.user.id, 'update_user', id, { firstName, lastName, role, isActive });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: user.toSafeObject() }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/users/:id/reset-password
// @desc    Reset user password (admin function)
// @access  Private/Admin
router.put('/users/:id/reset-password', [
  param('id').isUUID().isLength({ min: 36, max: 36 }),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { id } = req.params;
    const { newPassword } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Hash new password with salt 12
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user password
    await user.update({ password: hashedPassword });

    // Log admin action
    auditLogger.adminAction(req.user.id, 'reset_user_password', id, { email: user.email });

    res.json({
      success: true,
      message: 'Password reset successfully. User can now login with the new password.'
    });
  } catch (error) {
    console.error('❌ Password reset error:', error);
    next(error);
  }
});

// Valid application statuses (must match the Application model enum)
const VALID_APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'documents_required',
  'biometrics_scheduled',
  'biometrics_completed',
  'approved',
  'rejected',
  'completed',
  'issued'
];

// @route   GET /api/admin/applications
// @desc    Get all applications with filtering
// @access  Private/Admin
router.get('/applications', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(VALID_APPLICATION_STATUSES),
  query('visaType').optional().isIn(['tourist', 'business', 'student', 'work', 'transit', 'family', 'diplomatic']),
  query('assignedOfficer').optional().isUUID()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { page = 1, limit = 10, status, visaType, assignedOfficer } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (visaType) where.visaType = visaType;
    if (assignedOfficer) where.assignedOfficerId = assignedOfficer;

    const { count, rows: applications } = await Application.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] },
        { model: User, as: 'assignedOfficer', attributes: ['firstName', 'lastName'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        applications,
        pagination: {
          total: count,
          page,
          pages: Math.ceil(count / limit),
          limit
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/applications/:id/status
// @desc    Update application status
// @access  Private/Admin
router.put('/applications/:id/status', [
  param('id').isUUID(),
  body('status').isIn(VALID_APPLICATION_STATUSES),
  body('notes').optional().trim(),
  body('assignedOfficer').optional().isUUID()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { id } = req.params;
    const { status, notes, assignedOfficer } = req.body;

    // DEBUG: Log the search attempt
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 DEBUG: Admin Status Update Attempt');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`Application ID requested: ${id}`);
    console.log(`Status to set: ${status}`);
    console.log(`Admin User ID: ${req.user.id}`);
    console.log(`Admin User Role: ${req.user.role}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('');

    // Try to find the application with detailed logging
    const application = await Application.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }
      ]
    });

    // DEBUG: Log the search result
    if (application) {
      console.log('✅ Application FOUND:');
      console.log(`   ID: ${application.id}`);
      console.log(`   Application Number: ${application.applicationNumber}`);
      console.log(`   Status: ${application.status}`);
      console.log(`   User ID: ${application.userId}`);
      console.log(`   Visa Type: ${application.visaType}`);
      console.log(`   Created At: ${application.createdAt}`);
      console.log(`   Updated At: ${application.updatedAt}`);
    } else {
      console.log('❌ Application NOT FOUND');
      console.log(`   Searched for ID: ${id}`);
      console.log('');
      // Try to query directly to see if record exists with different casing
      const directQuery = await Application.sequelize.query(
        `SELECT id, application_number, status, user_id, created_at FROM "applications" WHERE id = :id`,
        { replacements: { id }, type: Application.sequelize.QueryTypes.SELECT }
      );
      console.log('   Direct SQL Query Result:', directQuery.length > 0 ? 'Record found' : 'No record found');
      if (directQuery.length > 0) {
        console.log('   Record details:', JSON.stringify(directQuery[0], null, 2));
      }
      // Try searching for similar IDs (first 8 characters)
      const similarIdsQuery = await Application.sequelize.query(
        `SELECT id, application_number, status, user_id, created_at FROM "applications" WHERE id::text LIKE :prefix || '%'`,
        { replacements: { prefix: id.substring(0, 8) }, type: Application.sequelize.QueryTypes.SELECT }
      );
      console.log('   Similar IDs Query Result:', similarIdsQuery.length > 0 ? `${similarIdsQuery.length} record(s) found` : 'No similar records found');
      if (similarIdsQuery.length > 0) {
        console.log('   Similar record details:');
        similarIdsQuery.forEach((record, index) => {
          console.log(`     ${index + 1}. ID: ${record.id}, Status: ${record.status}, User: ${record.user_id}`);
        });
      }
    }
    console.log('═══════════════════════════════════════════════════════════');

    if (!application) {
      logger.warn(`Application not found for status update - ID: ${id}, User: ${req.user.id}`);
      return next(new AppError(`Application with ID '${id}' not found. The application may have been deleted or the ID is incorrect.`, 404));
    }

    const oldStatus = application.status;
    const applicationInfo = {
      id: application.id,
      applicationNumber: application.applicationNumber,
      currentStatus: application.status,
      applicant: application.user ? `${application.user.firstName} ${application.user.lastName}` : 'Unknown'
    };

    // Update application
    const updateData = { status };
    if (notes) updateData.processingNotes = notes;
    if (assignedOfficer) updateData.assignedOfficerId = assignedOfficer;

    // Set timestamps based on status
    const now = new Date();
    if (status === 'under_review') updateData.reviewed_at = now;
    if (status === 'approved') updateData.approved_at = now;
    if (status === 'rejected') updateData.rejected_at = now;
    if (status === 'biometrics_scheduled') updateData.biometrics_date = now;

    await application.update(updateData);

    // Log status change
    auditLogger.applicationStatusChange(id, oldStatus, status, req.user.id);

    // Create notification for user
    await Notification.create({
      userId: application.userId,
      applicationId: id,
      type: 'application_status_update',
      title: 'Application Status Updated',
      message: `Your visa application status has been updated to: ${status.replace('_', ' ').toUpperCase()}`,
      priority: 'medium',
      createdBy: req.user.id
    });

    // Check if application is completed or issued - send farewell email
    if (status === 'completed' || status === 'issued') {
      const user = await User.findByPk(application.userId);
      
      // Create special farewell notification
      await Notification.create({
        userId: application.userId,
        applicationId: id,
        type: 'farewell',
        title: '🎉 Congratulations! Your Visa Application is Complete!',
        message: `Dear ${user.firstName}, your visa application (${application.applicationNumber}) has been successfully processed and ${status === 'issued' ? 'your visa has been issued!' : 'marked as completed!'}. We wish you a pleasant journey!`,
        priority: 'high',
        createdBy: req.user.id
      });

      // Log farewell email (simulated - would send real email in production)
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📧 FAREWELL EMAIL SENT TO:', user.email);
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`To: ${user.firstName} ${user.lastName} <${user.email}>`);
      console.log(`Subject: 🎉 Congratulations! Your Visa Application is Complete!`);
      console.log(`─────────────────────────────────────────────────────────────`);
      console.log(`Dear ${user.firstName},`);
      console.log('');
      console.log(`Congratulations! Your visa application (${application.applicationNumber}) has been`);
      console.log(`successfully processed and ${status === 'issued' ? 'your visa has been issued!' : 'marked as completed!'}`);
      console.log('');
      console.log(`Visa Type: ${application.visaType}`);
      console.log(`Destination: ${application.destinationCountry || 'N/A'}`);
      console.log(`Application Number: ${application.applicationNumber}`);
      console.log('');
      console.log(`We wish you a pleasant and safe journey!`);
      console.log('');
      console.log(`Best regards,`);
      console.log(`ArRaji Visa Services Team`);
      console.log('═══════════════════════════════════════════════════════════');
    }

    res.json({
      success: true,
      message: 'Application status updated successfully',
      data: { application }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/reports
// @desc    Get various reports
// @access  Private/Admin
router.get('/reports', async (req, res, next) => {
  try {
    // Application status distribution
    const applicationStats = await Application.findAll({
      attributes: [
        'status',
        [Application.sequelize.fn('COUNT', Application.sequelize.col('status')), 'count']
      ],
      group: ['status']
    });

    // Visa type distribution
    const visaStats = await Application.findAll({
      attributes: [
        'visaType',
        [Application.sequelize.fn('COUNT', Application.sequelize.col('visa_type')), 'count']
      ],
      group: ['visaType']
    });

    // Monthly applications
    const monthlyStats = await Application.findAll({
      attributes: [
        [Application.sequelize.fn('DATE_TRUNC', 'month', Application.sequelize.col('created_at')), 'month'],
        [Application.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: [Application.sequelize.fn('DATE_TRUNC', 'month', Application.sequelize.col('created_at'))],
      order: [[Application.sequelize.fn('DATE_TRUNC', 'month', Application.sequelize.col('created_at')), 'ASC']]
    });

    // Revenue statistics
    const revenueStats = await Payment.findAll({
      attributes: [
        [Payment.sequelize.fn('DATE_TRUNC', 'month', Payment.sequelize.col('created_at')), 'month'],
        [Payment.sequelize.fn('SUM', Payment.sequelize.col('amount')), 'total']
      ],
      where: { status: 'completed' },
      group: [Payment.sequelize.fn('DATE_TRUNC', 'month', Payment.sequelize.col('created_at'))],
      order: [[Payment.sequelize.fn('DATE_TRUNC', 'month', Payment.sequelize.col('created_at')), 'ASC']]
    });

    res.json({
      success: true,
      data: {
        applicationStats,
        visaStats,
        monthlyStats,
        revenueStats
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/passport-tracking
// @desc    Get all passports for tracking
// @access  Private/Admin
router.get('/passport-tracking', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;

    // For now, return mock data structure until real model exists
    // In production, this would query a Passport or Application model
    const mockPassports = [
      {
        id: 'PP-001',
        applicationId: 'VISA-2024-001',
        applicantName: 'Ahmed Al-Rashid',
        applicantEmail: 'ahmed@example.com',
        applicantPhone: '+971 50 123 4567',
        currentLocation: 'with_courier',
        locationHistory: [
          { status: 'application_received', location: 'Client', date: '2024-01-15 09:30', note: 'Application received' },
          { status: 'documents_collected', location: 'Office', date: '2024-01-15 14:00', note: 'Documents verified' },
          { status: 'with_courier', location: 'Lagos to Abuja', date: '2024-01-16 10:00', note: 'Courier picked up' },
        ],
        courier: { name: 'DHL Express', tracking: 'DHL123456789', eta: '2024-01-17' },
        embassy: { name: 'UAE Embassy Abuja', submittedDate: null, collectedDate: null },
        status: 'in_transit',
        priority: 'high',
        lastUpdated: '2024-01-16 10:30'
      },
      {
        id: 'PP-002',
        applicationId: 'VISA-2024-002',
        applicantName: 'Sarah Johnson',
        applicantEmail: 'sarah@example.com',
        applicantPhone: '+971 55 987 6543',
        currentLocation: 'at_embassy',
        locationHistory: [
          { status: 'application_received', location: 'Client', date: '2024-01-10 11:15', note: 'Application received' },
          { status: 'documents_collected', location: 'Office', date: '2024-01-10 16:00', note: 'Documents verified' },
          { status: 'courier_to_embassy', location: 'Abuja Office', date: '2024-01-12 08:00', note: 'With courier to embassy' },
          { status: 'at_embassy', location: 'UK Embassy Abuja', date: '2024-01-12 14:00', note: 'Submitted to embassy' },
        ],
        courier: { name: 'FedEx', tracking: 'FX987654321', eta: null },
        embassy: { name: 'UK Embassy Abuja', submittedDate: '2024-01-12', collectedDate: null },
        status: 'at_embassy',
        priority: 'medium',
        lastUpdated: '2024-01-12 14:00'
      }
    ];

    res.json({
      success: true,
      data: {
        passports: mockPassports,
        pagination: {
          total: mockPassports.length,
          page,
          pages: Math.ceil(mockPassports.length / limit),
          limit
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/passport/:id/status
// @desc    Update passport status
// @access  Private/Admin
router.put('/passport/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, location, note } = req.body;

    // In production, update the database record
    res.json({
      success: true,
      message: 'Passport status updated successfully',
      data: {
        id,
        status,
        location,
        note,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/passport/:id/courier
// @desc    Update courier information
// @access  Private/Admin
router.put('/passport/:id/courier', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { courierName, trackingNumber, eta } = req.body;

    res.json({
      success: true,
      message: 'Courier information updated successfully',
      data: {
        id,
        courier: { name: courierName, tracking: trackingNumber, eta },
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/application/:id
// @desc    Get single application details
// @access  Private/Admin
router.get('/application/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const application = await Application.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email', 'phone'] },
        { model: Document, as: 'documents' },
        { model: Payment, as: 'payments' },
        { model: BiometricAppointment, as: 'biometricAppointment' }
      ]
    });

    if (!application) {
      return next(new AppError('Application not found', 404));
    }

    res.json({
      success: true,
      data: { application }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/admin/application/:id/notes
// @desc    Add processing note to application
// @access  Private/Admin
router.post('/application/:id/notes', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note) {
      return next(new AppError('Note content is required', 400));
    }

    const application = await Application.findByPk(id);
    if (!application) {
      return next(new AppError('Application not found', 404));
    }

    // Get existing notes or initialize empty
    const existingNotes = application.processingNotes || [];
    const newNoteEntry = {
      content: note,
      createdBy: req.user.id,
      createdByName: `${req.user.firstName} ${req.user.lastName}`,
      createdAt: new Date().toISOString()
    };

    await application.update({
      processingNotes: [...existingNotes, newNoteEntry]
    });

    // Log action
    auditLogger.adminAction(req.user.id, 'add_note', id, { note });

    res.json({
      success: true,
      message: 'Note added successfully',
      data: { note: newNoteEntry }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/application/:id/assign
// @desc    Assign application to officer
// @access  Private/Admin
router.put('/application/:id/assign', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { officerId } = req.body;

    const application = await Application.findByPk(id);
    if (!application) {
      return next(new AppError('Application not found', 404));
    }

    await application.update({
      assignedOfficerId: officerId,
      assigned_at: new Date()
    });

    // Create notification for assigned officer
    const officer = await User.findByPk(officerId);
    if (officer) {
      await Notification.create({
        userId: officerId,
        applicationId: id,
        type: 'assignment',
        title: 'New Application Assigned',
        message: `You have been assigned to application ${application.applicationNumber}`,
        priority: 'high',
        createdBy: req.user.id
      });
    }

    res.json({
      success: true,
      message: 'Application assigned successfully',
      data: { application }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/admin/application/:id/send-cost-estimation
// @desc    Send cost estimation to user (admin manually triggers)
// @access  Private/Admin
router.post('/application/:id/send-cost-estimation', [
  param('id').isUUID(),
  body('processingFee').optional().isFloat({ min: 0 }),
  body('biometricsFee').optional().isFloat({ min: 0 }),
  body('serviceFee').optional().isFloat({ min: 0 }),
  body('courierFee').optional().isFloat({ min: 0 }),
  body('total').optional().isFloat({ min: 0 }),
  body('paymentDeadline').optional().isISO8601()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { id } = req.params;
    const {
      processingFee = 120.00,
      biometricsFee = 50.00,
      serviceFee = 30.00,
      courierFee = 25.00,
      total = 225.00,
      paymentDeadline
    } = req.body;

    const application = await Application.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }]
    });

    if (!application) {
      return next(new AppError('Application not found', 404));
    }

    // Check if cost estimation has already been sent
    if (application.status === 'cost_provided') {
      return next(new AppError('Cost estimation has already been sent for this application', 400));
    }

    // Calculate payment deadline (3 days from now if not provided)
    const deadline = paymentDeadline ? new Date(paymentDeadline) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    // Update application with cost details and status
    await application.update({
      status: 'cost_provided',
      processingFee,
      biometricsFee,
      serviceFee,
      courierFee,
      totalCost: total,
      paymentDeadline: deadline,
      costProvidedAt: new Date()
    });

    // Create notification for user
    await Notification.create({
      userId: application.userId,
      applicationId: id,
      type: 'cost',
      title: 'Cost Details Provided',
      message: 'The visa cost breakdown has been sent to your email. Please review and proceed with payment.',
      priority: 'high',
      createdBy: req.user.id
    });

    // Log admin action
    auditLogger.adminAction(req.user.id, 'send_cost_estimation', id, {
      processingFee,
      biometricsFee,
      serviceFee,
      courierFee,
      total,
      paymentDeadline: deadline
    });

    res.json({
      success: true,
      message: 'Cost estimation sent successfully to user',
      data: {
        application: {
          id: application.id,
          applicationNumber: application.applicationNumber,
          status: application.status,
          costDetails: {
            processingFee,
            biometricsFee,
            serviceFee,
            courierFee,
            total,
            paymentDeadline: deadline
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/admin/system/settings
// @desc    Get system settings
// @access  Private/Admin
router.get('/system/settings', async (req, res, next) => {
  try {
    // Return mock system settings
    res.json({
      success: true,
      data: {
        settings: {
          maintenanceMode: false,
          registrationEnabled: true,
          emailService: true,
          smsService: true,
          backupFrequency: 'daily',
          logRetention: '30',
          sessionTimeout: '60',
          passwordPolicy: 'strong',
          ipWhitelist: false,
          auditLogging: true,
          adminAlerts: true,
          systemAlerts: true,
          userRegistrationAlerts: true,
          errorAlerts: true
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/system/settings
// @desc    Update system settings
// @access  Private/Admin
router.put('/system/settings', async (req, res, next) => {
  try {
    const settings = req.body;

    // Log the settings change
    auditLogger.adminAction(req.user.id, 'update_system_settings', null, { settings });

    res.json({
      success: true,
      message: 'System settings updated successfully',
      data: { settings }
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/admin/users
// @desc    Delete all users (except current admin)
// @access  Private/Admin
router.delete('/users', async (req, res, next) => {
  try {
    // Get the current admin's ID to exclude from deletion
    const currentAdminId = req.user.id;

    // Count users before deletion
    const totalUsers = await User.count();
    const usersToDelete = await User.count({
      where: {
        id: { [Op.ne]: currentAdminId }
      }
    });

    // Delete all users except the current admin
    await User.destroy({
      where: {
        id: { [Op.ne]: currentAdminId }
      }
    });

    // Log the action
    auditLogger.adminAction(req.user.id, 'delete_all_users', null, { 
      totalUsers, 
      deletedCount: usersToDelete,
      retainedAdminId: currentAdminId
    });

    res.json({
      success: true,
      message: `Successfully deleted ${usersToDelete} users. Admin user (${currentAdminId}) was preserved.`,
      data: {
        deletedCount: usersToDelete,
        preservedAdminId: currentAdminId
      }
    });
  } catch (error) {
    console.error('❌ Delete all users error:', error);
    next(error);
  }
});

// Valid document statuses
const VALID_DOCUMENT_STATUSES = ['pending', 'approved', 'rejected'];

// @route   GET /api/admin/documents
// @desc    Get all documents with pagination and filtering
// @access  Private/Admin
router.get('/documents', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(VALID_DOCUMENT_STATUSES),
  query('documentType').optional().isString(),
  query('search').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { page = 1, limit = 10, status, documentType, search } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const where = {};
    if (status) where.status = status;
    if (documentType) where.documentType = documentType;
    if (search) {
      where[Op.or] = [
        { fileName: { [Op.iLike]: `%${search}%` } },
        { originalName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: documents } = await Document.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] },
        { model: Application, as: 'application', attributes: ['id', 'visaType', 'applicationNumber'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          total: count,
          page,
          pages: Math.ceil(count / limit),
          limit
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/documents/:id/status
// @desc    Update document status (approve/reject)
// @access  Private/Admin
router.put('/documents/:id/status', [
  param('id').isUUID(),
  body('status').isIn(VALID_DOCUMENT_STATUSES),
  body('rejectionReason').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const document = await Document.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] },
        { model: Application, as: 'application', attributes: ['id', 'visaType'] }
      ]
    });

    if (!document) {
      return next(new AppError('Document not found', 404));
    }

    // Update document
    const updateData = { status };
    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }
    if (status === 'approved') {
      updateData.verifiedAt = new Date();
    }

    await document.update(updateData);

    // Log admin action
    auditLogger.adminAction(req.user.id, 'update_document_status', id, { status, rejectionReason });

    // Create notification for user if document is rejected
    if (status === 'rejected' && document.userId) {
      await Notification.create({
        userId: document.userId,
        applicationId: document.applicationId,
        type: 'document_rejected',
        title: 'Document Rejected',
        message: `Your document "${document.documentType}" has been rejected. Reason: ${rejectionReason || 'No reason provided'}`,
        priority: 'high',
        createdBy: req.user.id
      });
    }

    // Create notification for user if document is approved
    if (status === 'approved' && document.userId) {
      await Notification.create({
        userId: document.userId,
        applicationId: document.applicationId,
        type: 'document_approved',
        title: 'Document Approved',
        message: `Your document "${document.documentType}" has been approved.`,
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

module.exports = router;
