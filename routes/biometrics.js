const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { BiometricAppointment, Application, User, Notification } = require('../models');
const { protect, authorize, authorizeOwnerOrAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { auditLogger } = require('../middleware/logger');

const router = express.Router();

// All biometric routes require authentication
router.use(protect);

// @route   GET /api/biometrics
// @desc    Get user's biometric appointments
// @access  Private
router.get('/', async (req, res, next) => {
  try {
    const appointments = await BiometricAppointment.findAll({
      where: { userId: req.user.id },
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'visaType', 'status', 'destinationCountry', 'fullName']
        },
        {
          model: User,
          as: 'scheduledByUser',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'completedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['appointmentDate', 'ASC']]
    });

    res.json({
      success: true,
      data: { appointments }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/biometrics/:id
// @desc    Get specific biometric appointment
// @access  Private
router.get('/:id', [
  param('id').isUUID().withMessage('Invalid appointment ID')
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

    const appointment = await BiometricAppointment.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'visaType', 'status', 'destinationCountry', 'fullName']
        },
        {
          model: User,
          as: 'scheduledByUser',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: User,
          as: 'completedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!appointment) {
      return next(new AppError('Appointment not found', 404));
    }

    res.json({
      success: true,
      data: { appointment }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/biometrics
// @desc    Schedule biometric appointment (Admin/Officer only)
// @access  Private (Admin/Officer)
router.post('/', [
  authorize('admin', 'officer'),
  body('applicationId')
    .isUUID()
    .withMessage('Application ID is required'),
  body('appointmentDate')
    .isISO8601()
    .toDate()
    .withMessage('Valid appointment date is required'),
  body('location')
    .trim()
    .notEmpty()
    .withMessage('Location is required'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters')
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

    const { applicationId, appointmentDate, location, notes } = req.body;

    // Check if application exists
    const application = await Application.findByPk(applicationId);
    if (!application) {
      return next(new AppError('Application not found', 404));
    }

    // Check if appointment already exists for this application
    const existingAppointment = await BiometricAppointment.findOne({
      where: { applicationId }
    });

    if (existingAppointment) {
      return next(new AppError('Biometric appointment already scheduled for this application', 400));
    }

    // Create appointment
    const appointment = await BiometricAppointment.create({
      applicationId,
      userId: application.userId,
      appointmentDate,
      location,
      status: 'scheduled',
      notes,
      scheduledBy: req.user.id
    });

    // Update application status
    await application.update({ status: 'biometrics_scheduled' });

    // Create notification for user
    await Notification.create({
      userId: application.userId,
      applicationId,
      type: 'biometric_scheduled',
      title: 'Biometric Appointment Scheduled',
      message: `Your biometric appointment has been scheduled for ${new Date(appointmentDate).toLocaleDateString()} at ${location}`,
      priority: 'high',
      createdBy: req.user.id
    });

    auditLogger.adminAction(req.user.id, 'schedule_biometric', application.userId, {
      applicationId,
      appointmentId: appointment.id,
      appointmentDate,
      location
    });

    res.status(201).json({
      success: true,
      message: 'Biometric appointment scheduled successfully',
      data: { appointment }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/biometrics/:id/status
// @desc    Update biometric appointment status
// @access  Private (Admin/Officer)
router.put('/:id/status', [
  authorize('admin', 'officer'),
  param('id').isUUID().withMessage('Invalid appointment ID'),
  body('status')
    .isIn(['scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show'])
    .withMessage('Valid status is required'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters')
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

    const appointment = await BiometricAppointment.findByPk(req.params.id, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!appointment) {
      return next(new AppError('Appointment not found', 404));
    }

    const { status, notes } = req.body;
    const updateData = { status };
    if (notes) updateData.notes = notes;

    // Set completedBy and completedAt if status is completed
    if (status === 'completed' && appointment.status !== 'completed') {
      updateData.completedBy = req.user.id;
      updateData.completedAt = new Date();
    }

    await appointment.update(updateData);

    // Update application status based on biometric status
    const application = appointment.application;
    if (application) {
      if (status === 'completed') {
        await application.update({ status: 'biometrics_completed' });
      } else if (status === 'cancelled') {
        await application.update({ status: 'documents_requested' });
      }
    }

    auditLogger.adminAction(req.user.id, 'update_biometric_status', appointment.userId, {
      appointmentId: appointment.id,
      oldStatus: appointment.status,
      newStatus: status
    });

    res.json({
      success: true,
      message: 'Appointment status updated successfully',
      data: { appointment }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/biometrics/:id/reschedule
// @desc    Reschedule biometric appointment
// @access  Private (Admin/Officer)
router.put('/:id/reschedule', [
  authorize('admin', 'officer'),
  param('id').isUUID().withMessage('Invalid appointment ID'),
  body('appointmentDate')
    .isISO8601()
    .toDate()
    .withMessage('Valid new appointment date is required'),
  body('location')
    .optional()
    .trim(),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Reschedule reason is required')
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

    const appointment = await BiometricAppointment.findByPk(req.params.id);
    if (!appointment) {
      return next(new AppError('Appointment not found', 404));
    }

    if (appointment.status !== 'scheduled') {
      return next(new AppError('Only scheduled appointments can be rescheduled', 400));
    }

    const { appointmentDate, location, reason } = req.body;

    await appointment.update({
      appointmentDate,
      location: location || appointment.location,
      status: 'rescheduled',
      notes: `${appointment.notes || ''}\nRescheduled: ${reason}`
    });

    // Notify user
    await Notification.create({
      userId: appointment.userId,
      applicationId: appointment.applicationId,
      type: 'biometric_rescheduled',
      title: 'Biometric Appointment Rescheduled',
      message: `Your biometric appointment has been rescheduled to ${new Date(appointmentDate).toLocaleDateString()}`,
      priority: 'high',
      createdBy: req.user.id
    });

    auditLogger.adminAction(req.user.id, 'reschedule_biometric', appointment.userId, {
      appointmentId: appointment.id,
      oldDate: appointment.appointmentDate,
      newDate: appointmentDate,
      reason
    });

    res.json({
      success: true,
      message: 'Appointment rescheduled successfully',
      data: { appointment }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/biometrics/admin/all
// @desc    Get all biometric appointments (Admin/Officer)
// @access  Private (Admin/Officer)
router.get('/admin/all', protect, authorize('admin', 'officer'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, dateFrom, dateTo } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;

    if (dateFrom || dateTo) {
      whereClause.appointmentDate = {};
      if (dateFrom) whereClause.appointmentDate[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.appointmentDate[Op.lte] = new Date(dateTo);
    }

    const appointments = await BiometricAppointment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'visaType', 'status', 'destinationCountry', 'fullName'],
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'email']
          }]
        },
        {
          model: User,
          as: 'scheduledByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['appointmentDate', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        appointments: appointments.rows,
        pagination: {
          total: appointments.count,
          page: parseInt(page),
          pages: Math.ceil(appointments.count / limit),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/biometrics/stats
// @desc    Get biometric statistics (Admin/Officer)
// @access  Private (Admin/Officer)
router.get('/admin/stats', protect, authorize('admin', 'officer'), async (req, res, next) => {
  try {
    const statusStats = await BiometricAppointment.findAll({
      attributes: [
        'status',
        [BiometricAppointment.sequelize.fn('COUNT', BiometricAppointment.sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    const todayStats = await BiometricAppointment.findAll({
      where: {
        appointmentDate: {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)),
          [Op.lt]: new Date(new Date().setHours(23, 59, 59, 999))
        }
      },
      attributes: [
        'status',
        [BiometricAppointment.sequelize.fn('COUNT', BiometricAppointment.sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    res.json({
      success: true,
      data: {
        statusStats,
        todayStats
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/biometrics/locations
// @desc    Get available biometric locations
// @access  Private
router.get('/locations', protect, async (req, res, next) => {
  try {
    // Locations data - in production, this would come from a database
    // Simple format to avoid validation issues
    const locations = [
      {
        id: 'dubai_main',
        name: 'Dubai Main Center',
        city: 'Dubai',
        country: 'UAE',
        phone: '+971-4-123-4567',
        isActive: true
      },
      {
        id: 'abu_dhabi',
        name: 'Abu Dhabi Branch',
        city: 'Abu Dhabi',
        country: 'UAE',
        phone: '+971-2-765-4321',
        isActive: true
      },
      {
        id: 'sharjah',
        name: 'Sharjah Office',
        city: 'Sharjah',
        country: 'UAE',
        phone: '+971-6-987-6543',
        isActive: true
      },
      {
        id: 'al_ain',
        name: 'Al Ain Center',
        city: 'Al Ain',
        country: 'UAE',
        isActive: true
      },
      {
        id: 'ras_al_khaimah',
        name: 'Ras Al Khaimah Office',
        city: 'Ras Al Khaimah',
        country: 'UAE',
        isActive: true
      }
    ];

    res.json({
      success: true,
      data: { locations }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

