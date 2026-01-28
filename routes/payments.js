const express = require('express');
const { Op } = require('sequelize');
const { body, param, validationResult } = require('express-validator');
const { Payment, Application, User } = require('../models');
const { protect, authorize, authorizeOwnerOrAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');

const router = express.Router();

// @route   GET /api/payments
// @desc    Get user's payments
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const payments = await Payment.findAll({
      where: { userId: req.user.id },
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'visaType', 'status', 'destinationCountry']
        },
        {
          model: User,
          as: 'processedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: { payments }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/payments/:id
// @desc    Get specific payment
// @access  Private
router.get('/:id', [
  protect,
  param('id').isUUID().withMessage('Invalid payment ID')
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

    const payment = await Payment.findOne({
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
          as: 'processedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!payment) {
      return next(new AppError('Payment not found', 404));
    }

    res.json({
      success: true,
      data: { payment }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/payments
// @desc    Create payment record
// @access  Private
router.post('/', [
  protect,
  body('applicationId')
    .isUUID()
    .withMessage('Application ID is required'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Valid amount is required'),
  body('currency')
    .isIn(['USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD'])
    .withMessage('Valid currency is required'),
  body('paymentMethod')
    .isIn(['credit_card', 'debit_card', 'bank_transfer', 'paypal', 'cash'])
    .withMessage('Valid payment method is required'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters')
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

    const { applicationId, amount, currency, paymentMethod, description, transactionId } = req.body;

    // Check if application exists and belongs to user
    const application = await Application.findOne({
      where: {
        id: applicationId,
        userId: req.user.id
      }
    });

    if (!application) {
      return next(new AppError('Application not found', 404));
    }

    // Check if payment already exists for this application
    const existingPayment = await Payment.findOne({
      where: { applicationId }
    });

    if (existingPayment) {
      return next(new AppError('Payment already exists for this application', 400));
    }

    // Create payment record
    const payment = await Payment.create({
      applicationId,
      userId: req.user.id,
      amount,
      currency,
      paymentMethod,
      status: 'pending',
      description: description || `Payment for ${application.visaType} visa application`,
      transactionId
    });

    logger.info(`Payment initiated for application ${applicationId} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Payment record created successfully',
      data: { payment }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/payments/:id/status
// @desc    Update payment status (Admin/Officer only)
// @access  Private (Admin/Officer)
router.put('/:id/status', [
  protect,
  authorize('admin', 'officer'),
  param('id').isUUID().withMessage('Invalid payment ID'),
  body('status')
    .isIn(['pending', 'processing', 'completed', 'failed', 'refunded'])
    .withMessage('Valid status is required'),
  body('transactionId')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Transaction ID cannot be empty'),
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

    const payment = await Payment.findByPk(req.params.id, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!payment) {
      return next(new AppError('Payment not found', 404));
    }

    const { status, transactionId, notes } = req.body;
    const updateData = { status };

    if (transactionId) updateData.transactionId = transactionId;
    if (notes) updateData.notes = notes;

    // Set processedBy if status is being changed to completed
    if (status === 'completed' && payment.status !== 'completed') {
      updateData.processedBy = req.user.id;
      updateData.processedAt = new Date();
    }

    await payment.update(updateData);

    // Update application status if payment is completed
    if (status === 'completed') {
      const application = payment.application;
      if (application && application.status === 'payment_pending') {
        await application.update({ status: 'payment_completed' });
      }
    }

    logger.info(`Payment ${req.params.id} status updated to ${status} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: { payment }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/payments/:id/refund
// @desc    Process refund (Admin only)
// @access  Private (Admin)
router.post('/:id/refund', [
  protect,
  authorize('admin'),
  param('id').isUUID().withMessage('Invalid payment ID'),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Valid refund amount is required'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Refund reason is required')
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

    const payment = await Payment.findByPk(req.params.id);

    if (!payment) {
      return next(new AppError('Payment not found', 404));
    }

    if (payment.status !== 'completed') {
      return next(new AppError('Only completed payments can be refunded', 400));
    }

    const { amount, reason } = req.body;
    const refundAmount = amount || payment.amount;

    // Create refund record (you might want to create a separate Refund model)
    await payment.update({
      status: 'refunded',
      notes: `Refunded: ${reason}. Amount: ${refundAmount} ${payment.currency}`
    });

    logger.info(`Payment ${req.params.id} refunded by admin ${req.user.id}. Reason: ${reason}`);

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        payment,
        refundAmount,
        reason
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/payments/admin/all
// @desc    Get all payments (Admin/Officer)
// @access  Private (Admin/Officer)
router.get('/admin/all', protect, authorize('admin', 'officer'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, paymentMethod, dateFrom, dateTo } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {};

    if (status) whereClause.status = status;
    if (paymentMethod) whereClause.paymentMethod = paymentMethod;

    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const payments = await Payment.findAndCountAll({
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
          as: 'processedByUser',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    // Calculate total amounts
    const totalStats = await Payment.findAll({
      where: whereClause,
      attributes: [
        [Payment.sequelize.fn('SUM', Payment.sequelize.col('amount')), 'totalAmount'],
        [Payment.sequelize.fn('COUNT', Payment.sequelize.col('id')), 'totalPayments']
      ],
      raw: true
    });

    res.json({
      success: true,
      data: {
        payments: payments.rows,
        stats: totalStats[0],
        pagination: {
          total: payments.count,
          page: parseInt(page),
          pages: Math.ceil(payments.count / limit),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/payments/stats
// @desc    Get payment statistics (Admin/Officer)
// @access  Private (Admin/Officer)
router.get('/admin/stats', protect, authorize('admin', 'officer'), async (req, res, next) => {
  try {
    const stats = await Payment.findAll({
      attributes: [
        'status',
        [Payment.sequelize.fn('COUNT', Payment.sequelize.col('id')), 'count'],
        [Payment.sequelize.fn('SUM', Payment.sequelize.col('amount')), 'totalAmount']
      ],
      group: ['status'],
      raw: true
    });

    const monthlyStats = await Payment.findAll({
      attributes: [
        [Payment.sequelize.fn('DATE_TRUNC', 'month', Payment.sequelize.col('createdAt')), 'month'],
        [Payment.sequelize.fn('COUNT', Payment.sequelize.col('id')), 'count'],
        [Payment.sequelize.fn('SUM', Payment.sequelize.col('amount')), 'totalAmount']
      ],
      where: {
        createdAt: {
          [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1) // Last 12 months
        }
      },
      group: [Payment.sequelize.fn('DATE_TRUNC', 'month', Payment.sequelize.col('createdAt'))],
      order: [[Payment.sequelize.fn('DATE_TRUNC', 'month', Payment.sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      data: {
        statusStats: stats,
        monthlyStats
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

