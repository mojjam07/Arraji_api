const express = require('express');
const { param, query, validationResult, body } = require('express-validator');
const { Notification, Application } = require('../models');
const { protect, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

// All notification routes require authentication
router.use(protect);

// @route   GET /api/notifications
// @desc    Get user notifications
// @access  Private
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('status').optional().isIn(['unread', 'read', 'archived']),
  query('type').optional().isIn(['application_status_update', 'document_request', 'payment_reminder', 'biometrics_scheduled', 'biometrics_reminder', 'application_approved', 'application_rejected', 'document_approved', 'document_rejected', 'payment_completed', 'general_announcement', 'system_notification'])
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

    const { page = 1, limit = 20, status, type } = req.query;
    const offset = (page - 1) * limit;

    const where = { userId: req.user.id };
    if (status) where.status = status;
    if (type) where.type = type;

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where,
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'visaType', 'status', 'fullName'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: {
        notifications,
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

// @route   GET /api/notifications/unread-count
// @desc    Get unread notifications count
// @access  Private
router.get('/unread-count', async (req, res, next) => {
  try {
    const count = await Notification.count({
      where: {
        userId: req.user.id,
        status: 'unread'
      }
    });

    res.json({
      success: true,
      data: { unreadCount: count }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', [
  param('id').isInt().toInt()
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

    const { id } = req.params;

    const notification = await Notification.findOne({
      where: { id, userId: req.user.id }
    });

    if (!notification) {
      return next(new AppError('Notification not found', 404));
    }

    await notification.update({ status: 'read', readAt: new Date() });

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: { notification }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private
router.put('/mark-all-read', async (req, res, next) => {
  try {
    const [affectedRows] = await Notification.update(
      { status: 'read', readAt: new Date() },
      {
        where: {
          userId: req.user.id,
          status: 'unread'
        }
      }
    );

    res.json({
      success: true,
      message: `${affectedRows} notifications marked as read`
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/notifications/:id/archive
// @desc    Archive notification
// @access  Private
router.put('/:id/archive', [
  param('id').isInt().toInt()
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

    const { id } = req.params;

    const notification = await Notification.findOne({
      where: { id, userId: req.user.id }
    });

    if (!notification) {
      return next(new AppError('Notification not found', 404));
    }

    await notification.update({ status: 'archived', archivedAt: new Date() });

    res.json({
      success: true,
      message: 'Notification archived successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete notification (admin only or own notification)
// @access  Private
router.delete('/:id', [
  param('id').isInt().toInt()
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

    const { id } = req.params;

    const where = { id };
    if (req.user.role !== 'admin') {
      where.userId = req.user.id;
    }

    const notification = await Notification.findOne({ where });

    if (!notification) {
      return next(new AppError('Notification not found', 404));
    }

    await notification.destroy();

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/notifications/broadcast
// @desc    Create broadcast notification (admin only)
// @access  Private/Admin
router.post('/broadcast', authorize('admin'), [
  body('title').trim().isLength({ min: 1, max: 200 }),
  body('message').trim().isLength({ min: 1, max: 1000 }),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('targetUsers').optional().isArray(),
  body('expiresIn').optional().isInt({ min: 1, max: 365 }).toInt()
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

    const { title, message, priority = 'medium', targetUsers, expiresIn } = req.body;

    // Calculate expiry date
    let expiresAt = null;
    if (expiresIn) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expiresIn);
      expiresAt = expiryDate;
    }

    // Get target users
    const { User } = require('../models');
    const users = await User.findAll({
      where: targetUsers && targetUsers.length > 0 ? { id: targetUsers } : {},
      attributes: ['id']
    });

    // Create notifications for each user
    const notifications = [];
    for (const user of users) {
      const notification = await Notification.create({
        userId: user.id,
        type: 'general_announcement',
        title,
        message,
        priority,
        expiresAt,
        createdBy: req.user.id
      });
      notifications.push(notification);
    }

    res.status(201).json({
      success: true,
      message: `Broadcast notification sent to ${notifications.length} users`,
      data: {
        notificationsCreated: notifications.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/notifications/types
// @desc    Get notification types and their labels
// @access  Private
router.get('/types', (req, res) => {
  const types = {
    application_status_update: 'Application Update',
    document_request: 'Document Request',
    payment_reminder: 'Payment Reminder',
    biometrics_scheduled: 'Biometrics Scheduled',
    biometrics_reminder: 'Biometrics Reminder',
    application_approved: 'Application Approved',
    application_rejected: 'Application Rejected',
    document_approved: 'Document Approved',
    document_rejected: 'Document Rejected',
    payment_completed: 'Payment Completed',
    general_announcement: 'Announcement',
    system_notification: 'System Notification'
  };

  res.json({
    success: true,
    data: { types }
  });
});

module.exports = router;

