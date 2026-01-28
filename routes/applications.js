const express = require('express');
const { Op } = require('sequelize');
const { body, param, validationResult } = require('express-validator');
const { Application, User, Document, Payment, BiometricAppointment } = require('../models');
const { protect, authorize, authorizeOwnerOrAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { logger, auditLogger } = require('../middleware/logger');

const router = express.Router();

// @route   GET /api/applications
// @desc    Get user's applications
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const whereClause = { userId: req.user.id };
    
    // Filter by status if provided
    if (req.query.status) {
      whereClause.status = req.query.status;
    }

    const applications = await Application.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] },
        { model: Document, as: 'documents' },
        { model: Payment, as: 'payments' }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: { applications }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/applications/:id
// @desc    Get specific application
// @access  Private
router.get('/:id', [
  protect,
  param('id').isUUID().withMessage('Invalid application ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const application = await Application.findByPk(req.params.id, {
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email', 'phoneNumber'] },
        { model: Document, as: 'documents' },
        { model: Payment, as: 'payments' },
        { model: BiometricAppointment, as: 'biometricAppointment' }
      ]
    });

    if (!application) {
      return next(new AppError('Application not found', 404));
    }

    // Check if user owns the application or is admin/officer
    if (application.userId !== req.user.id && !['admin', 'officer'].includes(req.user.role)) {
      return next(new AppError('Not authorized to access this application', 403));
    }

    res.json({
      success: true,
      data: { application }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/applications
// @desc    Create new application
// @access  Private
router.post('/', [
  protect,
  body('visaType')
    .isIn(['tourist', 'business', 'student', 'work', 'transit', 'family', 'diplomatic'])
    .withMessage('Valid visa type is required'),
  body('destinationCountry')
    .optional()
    .trim(),
  body('firstName')
    .optional()
    .trim(),
  body('lastName')
    .optional()
    .trim(),
  body('passportNumber')
    .optional()
    .trim(),
  body('passportExpiryDate')
    .optional()
    .isISO8601()
    .withMessage('Valid passport expiry date is required'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Valid date of birth is required'),
  body('nationality')
    .optional()
    .trim(),
  body('purposeOfTravel')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Purpose of travel must be less than 500 characters'),
  body('intendedDurationOfStay')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Duration must be between 1 and 365 days'),
  body('intendedEntryDate')
    .optional()
    .isISO8601()
    .withMessage('Valid intended entry date is required'),
  body('accommodationType')
    .optional()
    .isIn(['hotel', 'hostel', 'rented', 'friend_relative', 'own_property', 'other'])
    .withMessage('Valid accommodation type is required'),
  body('hasPreviousVisa')
    .optional()
    .isBoolean()
    .withMessage('Previous visa flag must be a boolean'),
  body('previousVisaDetails')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Previous visa details must be less than 500 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Parse fullName into firstName and lastName if provided
    let { firstName, lastName } = req.body;
    if (req.body.fullName && !firstName && !lastName) {
      const nameParts = req.body.fullName.trim().split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ') || '';
    }

    const applicationData = {
      userId: req.user.id,
      applicationNumber: `VISA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      visaType: req.body.visaType,
      destinationCountry: req.body.destinationCountry || null,
      firstName: firstName || null,
      lastName: lastName || null,
      status: 'draft',
      ...req.body
    };

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 DEBUG: Application Creation Attempt');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`User ID creating application: ${req.user.id}`);
    console.log(`User Email: ${req.user.email}`);
    console.log(`Application Data:`);
    console.log(JSON.stringify(applicationData, null, 2));
    console.log('');

    const application = await Application.create(applicationData);

    console.log('✅ Application Created Successfully:');
    console.log(`   ID: ${application.id}`);
    console.log(`   Application Number: ${application.applicationNumber}`);
    console.log(`   Status: ${application.status}`);
    console.log(`   Visa Type: ${application.visaType}`);
    console.log(`   User ID: ${application.userId}`);
    console.log(`   Created At: ${application.createdAt}`);
    console.log('═══════════════════════════════════════════════════════════');

    logger.info(`New application created: ${application.applicationNumber} by user ${req.user.id}`);
    auditLogger.userAction(req.user.id, 'create_application', { applicationId: application.id, visaType: application.visaType });

    res.status(201).json({
      success: true,
      message: 'Application created successfully',
      data: { application }
    });
  } catch (error) {
    console.log('❌ Application Creation Failed:');
    console.log(`   Error: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
    console.log('═══════════════════════════════════════════════════════════');
    next(error);
  }
});

// @route   PUT /api/applications/:id
// @desc    Update application
// @access  Private
router.put('/:id', [
  protect,
  param('id').isUUID().withMessage('Invalid application ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const application = await Application.findByPk(req.params.id);

    if (!application) {
      return next(new AppError('Application not found', 404));
    }

    // Check if user owns the application
    if (application.userId !== req.user.id) {
      return next(new AppError('Not authorized to update this application', 403));
    }

    // Only allow updates if application is in draft status or user is admin/officer
    if (application.status !== 'draft' && !['admin', 'officer'].includes(req.user.role)) {
      return next(new AppError('Cannot update application after submission', 400));
    }

    await application.update(req.body);

    logger.info(`Application ${application.applicationNumber} updated by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Application updated successfully',
      data: { application }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/applications/:id/submit
// @desc    Submit application for review
// @access  Private
router.put('/:id/submit', [
  protect,
  param('id').isUUID().withMessage('Invalid application ID')
], async (req, res, next) => {
  try {
    const { id } = req.params;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 DEBUG: Application Submit Attempt');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`Application ID: ${id}`);
    console.log(`User ID submitting: ${req.user.id}`);
    console.log(`User Email: ${req.user.email}`);
    console.log('');

    const application = await Application.findByPk(id);

    if (!application) {
      console.log('❌ Application NOT FOUND for submission');
      console.log('   Searched for ID:', id);
      console.log('═══════════════════════════════════════════════════════════');
      return next(new AppError('Application not found', 404));
    }

    console.log('✅ Application Found for Submission:');
    console.log(`   ID: ${application.id}`);
    console.log(`   Application Number: ${application.applicationNumber}`);
    console.log(`   Current Status: ${application.status}`);
    console.log(`   User ID: ${application.userId}`);
    console.log('');

    // Check if user owns the application
    if (application.userId !== req.user.id) {
      console.log('❌ User not authorized to submit this application');
      console.log(`   Application User ID: ${application.userId}`);
      console.log(`   Submitting User ID: ${req.user.id}`);
      console.log('═══════════════════════════════════════════════════════════');
      return next(new AppError('Not authorized to submit this application', 403));
    }

    if (application.status !== 'draft') {
      console.log('❌ Application cannot be submitted - not in draft status');
      console.log(`   Current Status: ${application.status}`);
      console.log('═══════════════════════════════════════════════════════════');
      return next(new AppError('Only draft applications can be submitted', 400));
    }

    await application.update({
      status: 'submitted',
      submittedAt: new Date()
    });

    console.log('✅ Application Submitted Successfully:');
    console.log(`   ID: ${application.id}`);
    console.log(`   Application Number: ${application.applicationNumber}`);
    console.log(`   New Status: submitted`);
    console.log(`   Submitted At: ${application.submittedAt}`);
    console.log('═══════════════════════════════════════════════════════════');

    logger.info(`Application ${application.applicationNumber} submitted by user ${req.user.id}`);
    auditLogger.applicationStatusChange(application.id, 'draft', 'submitted', req.user.id);

    // Notify all admin users about the new application submission
    const { User, Notification } = require('../models');
    const adminUsers = await User.findAll({
      where: { role: 'admin', isActive: true }
    });

    // Create notification for each admin user
    for (const admin of adminUsers) {
      await Notification.create({
        userId: admin.id,
        applicationId: application.id,
        type: 'application_status_update',
        title: 'New Application Submitted for Review',
        message: `A new visa application (${application.applicationNumber}) has been submitted and requires your review.`,
        priority: 'high',
        createdBy: req.user.id
      });
    }

    logger.info(`Notifications sent to ${adminUsers.length} admin users for application ${application.applicationNumber}`);

    res.json({
      success: true,
      message: 'Application submitted successfully',
      data: { application }
    });
  } catch (error) {
    console.log('❌ Application Submit Failed:');
    console.log(`   Error: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
    console.log('═══════════════════════════════════════════════════════════');
    next(error);
  }
});

// @route   PUT /api/applications/:id/cancel
// @desc    Cancel application
// @access  Private
router.put('/:id/cancel', [
  protect,
  param('id').isUUID().withMessage('Invalid application ID')
], async (req, res, next) => {
  try {
    const application = await Application.findByPk(req.params.id);

    if (!application) {
      return next(new AppError('Application not found', 404));
    }

    // Check if user owns the application or is admin
    if (application.userId !== req.user.id && req.user.role !== 'admin') {
      return next(new AppError('Not authorized to cancel this application', 403));
    }

    if (['completed', 'approved', 'rejected'].includes(application.status)) {
      return next(new AppError('Cannot cancel application in current status', 400));
    }

    await application.update({ status: 'cancelled' });

    logger.info(`Application ${application.applicationNumber} cancelled by user ${req.user.id}`);
    auditLogger.applicationStatusChange(application.id, application.status, 'cancelled', req.user.id);

    res.json({
      success: true,
      message: 'Application cancelled successfully',
      data: { application }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/applications/cost-estimation
// @desc    Get visa cost estimation based on visa type
// @access  Private
router.get('/cost-estimation', protect, async (req, res, next) => {
  try {
    const { visaType, duration, express } = req.query;

    // Validate visaType is provided
    const validVisaTypes = ['tourist', 'business', 'student', 'work', 'transit', 'family', 'diplomatic'];
    
    if (!visaType) {
      return res.status(400).json({
        success: false,
        message: 'visaType query parameter is required',
        data: {
          validTypes: validVisaTypes
        }
      });
    }

    // Validate and sanitize visaType
    const sanitizedVisaType = validVisaTypes.includes(visaType) ? visaType : null;

    if (!sanitizedVisaType) {
      return res.status(400).json({
        success: false,
        message: `Invalid visaType: '${visaType}'. Valid types are: ${validVisaTypes.join(', ')}`,
        data: {
          validTypes: validVisaTypes
        }
      });
    }

    // Base prices for different visa types (in USD)
    // Using simple data structure to avoid validation issues
    const visaPricing = {
      tourist: {
        basePrice: 150,
        description: 'Tourist Visa',
        durations: [
          { days: 30, price: 150, label: '30 Days Single Entry' },
          { days: 60, price: 250, label: '60 Days Single Entry' },
          { days: 90, price: 350, label: '90 Days Single Entry' },
          { days: 180, price: 500, label: '180 Days Multiple Entry' }
        ]
      },
      business: {
        basePrice: 300,
        description: 'Business Visa',
        durations: [
          { days: 30, price: 300, label: '30 Days Business' },
          { days: 90, price: 500, label: '90 Days Business' },
          { days: 180, price: 800, label: '180 Days Business' },
          { days: 365, price: 1200, label: '1 Year Business' }
        ]
      },
      student: {
        basePrice: 500,
        description: 'Student Visa',
        durations: [
          { days: 90, price: 500, label: '3 Months Student' },
          { days: 180, price: 800, label: '6 Months Student' },
          { days: 365, price: 1200, label: '1 Year Student' },
          { days: 730, price: 2000, label: '2 Years Student' }
        ]
      },
      work: {
        basePrice: 1000,
        description: 'Work Visa',
        durations: [
          { days: 365, price: 1000, label: '1 Year Work Permit' },
          { days: 730, price: 1800, label: '2 Years Work Permit' },
          { days: 1095, price: 2500, label: '3 Years Work Permit' }
        ]
      },
      transit: {
        basePrice: 100,
        description: 'Transit Visa',
        durations: [
          { days: 2, price: 100, label: '48 Hours Transit' },
          { days: 4, price: 150, label: '96 Hours Transit' }
        ]
      },
      family: {
        basePrice: 400,
        description: 'Family Visa',
        durations: [
          { days: 365, price: 400, label: '1 Year Family' },
          { days: 730, price: 700, label: '2 Years Family' },
          { days: 1095, price: 1000, label: '3 Years Family' }
        ]
      },
      diplomatic: {
        basePrice: 0,
        description: 'Diplomatic Visa',
        durations: [
          { days: 30, price: 0, label: '30 Days Diplomatic' },
          { days: 90, price: 0, label: '90 Days Diplomatic' },
          { days: 180, price: 0, label: '180 Days Diplomatic' },
          { days: 365, price: 0, label: '1 Year Diplomatic' }
        ]
      }
    };

    // Additional fees
    const additionalFees = {
      express: 150,
      insurance: 50,
      smsUpdates: 10,
      emailUpdates: 0,
      courier: 25
    };

    // If no visaType specified, return all available types
    if (!sanitizedVisaType) {
      return res.json({
        success: true,
        data: {
          visaTypes: validVisaTypes.map(type => ({
            value: type,
            label: visaPricing[type].description,
            basePrice: visaPricing[type].basePrice
          })),
          message: 'Please select a visa type to see pricing'
        }
      });
    }

    const pricing = visaPricing[sanitizedVisaType];
    let selectedDuration = null;

    // Find selected duration if provided
    if (duration) {
      const durationNum = parseInt(duration);
      selectedDuration = pricing.durations.find(d => d.days === durationNum);
    }

    // Calculate total if specific options are selected
    let totalCost = 0;
    let breakdown = [];

    if (selectedDuration) {
      totalCost = selectedDuration.price;
      breakdown.push({
        item: `${pricing.description} - ${selectedDuration.label}`,
        price: selectedDuration.price
      });

      // Add express fee if requested
      if (express === 'true' || express === true) {
        totalCost += additionalFees.express;
        breakdown.push({
          item: 'Express Processing',
          price: additionalFees.express
        });
      }

      breakdown.push({
        item: 'Government Fee',
        price: Math.round(totalCost * 0.1)
      });
      totalCost += Math.round(totalCost * 0.1);
    }

    res.json({
      success: true,
      data: {
        visaTypes: validVisaTypes.map(type => ({
          value: type,
          label: visaPricing[type].description,
          basePrice: visaPricing[type].basePrice
        })),
        pricing: pricing,
        selectedPricing: visaPricing[sanitizedVisaType],
        selectedDuration: selectedDuration,
        additionalFees,
        estimatedTotal: totalCost > 0 ? totalCost : null,
        breakdown: totalCost > 0 ? breakdown : null,
        currency: 'USD',
        notes: [
          'Prices are subject to change without notice',
          'Government fees are approximately 10% of the visa fee',
          'Express processing reduces processing time to 24-48 hours',
          'All fees are non-refundable once application is submitted'
        ]
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/applications/statuses
// @desc    Get all application statuses
// @access  Private
router.get('/meta/statuses', protect, (req, res) => {
  res.json({
    success: true,
    data: {
      statuses: [
        { value: 'draft', label: 'Draft', description: 'Application is being prepared' },
        { value: 'submitted', label: 'Submitted', description: 'Application submitted for review' },
        { value: 'under_review', label: 'Under Review', description: 'Application is being reviewed' },
        { value: 'documents_requested', label: 'Documents Requested', description: 'Additional documents are required' },
        { value: 'cost_provided', label: 'Cost Provided', description: 'Processing cost has been provided' },
        { value: 'payment_pending', label: 'Payment Pending', description: 'Payment is pending' },
        { value: 'payment_completed', label: 'Payment Completed', description: 'Payment received' },
        { value: 'biometrics_scheduled', label: 'Biometrics Scheduled', description: 'Biometrics appointment scheduled' },
        { value: 'biometrics_completed', label: 'Biometrics Completed', description: 'Biometrics submitted' },
        { value: 'embassy_submitted', label: 'Embassy Submitted', description: 'Application submitted to embassy' },
        { value: 'processing', label: 'Processing', description: 'Application is being processed by embassy' },
        { value: 'approved', label: 'Approved', description: 'Visa application approved' },
        { value: 'rejected', label: 'Rejected', description: 'Visa application rejected' },
        { value: 'completed', label: 'Completed', description: 'Visa processing completed' }
      ],
      visaTypes: [
        { value: 'tourist_visa_uae', label: 'UAE Tourist Visa', destination: 'United Arab Emirates', duration: '30/60/90 days' },
        { value: 'business_visa_uk', label: 'UK Business Visa', destination: 'United Kingdom', duration: '6 months - 2 years' },
        { value: 'student_visa_canada', label: 'Canada Student Visa', destination: 'Canada', duration: 'Study permit duration' },
        { value: 'work_visa_australia', label: 'Australia Work Visa', destination: 'Australia', duration: '1-4 years' },
        { value: 'family_visa_usa', label: 'USA Family Visa', destination: 'United States', duration: 'Permanent' },
        { value: 'other', label: 'Other Visa Type', destination: 'Custom', duration: 'Variable' }
      ]
    }
  });
});

// @route   GET /api/applications/admin/all
// @desc    Get all applications (Admin/Officer)
// @access  Private (Admin/Officer)
router.get('/admin/all', protect, authorize('admin', 'officer'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, visaType, assignedOfficer, search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (visaType) whereClause.visaType = visaType;
    if (assignedOfficer) whereClause.assignedOfficer = assignedOfficer;
    if (search) {
      whereClause[Op.or] = [
        { applicationNumber: { [Op.iLike]: `%${search}%` } },
        { passportNumber: { [Op.iLike]: `%${search}%` } },
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: applications } = await Application.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        applications,
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

module.exports = router;

