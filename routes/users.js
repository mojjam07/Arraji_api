const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { User, Application, Payment, Notification } = require('../models');
const { protect, authorizeOwnerOrAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { securityLogger } = require('../middleware/logger');

const router = express.Router();

// All user routes require authentication
router.use(protect);

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'passwordResetToken', 'passwordResetExpires'] }
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  body('firstName').optional().trim().isLength({ min: 2 }),
  body('lastName').optional().trim().isLength({ min: 2 }),
  body('phoneNumber').optional().isMobilePhone(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('country').optional().trim()
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

    const { firstName, lastName, phoneNumber, address, city, country } = req.body;

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Update user profile
    await user.update({
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(phoneNumber && { phoneNumber }),
      ...(address && { address }),
      ...(city && { city }),
      ...(country && { country })
    });

    securityLogger.dataAccess(req.user.id, 'update', 'profile', req.ip);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: user.toSafeObject() }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/dashboard
// @desc    Get user dashboard data
// @access  Private
router.get('/dashboard', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user's applications statistics
    const [
      totalApplications,
      draftApplications,
      submittedApplications,
      completedApplications,
      pendingPayments
    ] = await Promise.all([
      Application.count({ where: { userId } }),
      Application.count({ where: { userId, status: 'draft' } }),
      Application.count({ where: { userId, status: 'submitted' } }),
      Application.count({ where: { userId, status: 'issued' } }),
      Payment.count({ where: { userId, status: 'pending' } })
    ]);

    // Get recent applications
    const recentApplications = await Application.findAll({
      where: { userId },
      order: [['updatedAt', 'DESC']],
      limit: 5,
      attributes: ['id', 'visaType', 'status', 'createdAt', 'updatedAt']
    });

    // Get unread notifications count
    const unreadNotifications = await Notification.count({
      where: { userId, status: 'unread' }
    });

    // Get recent notifications
    const recentNotifications = await Notification.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 3,
      attributes: ['id', 'title', 'message', 'priority', 'createdAt', 'status']
    });

    res.json({
      success: true,
      data: {
        statistics: {
          totalApplications,
          draftApplications,
          submittedApplications,
          completedApplications,
          pendingPayments
        },
        recentApplications,
        notifications: {
          unreadCount: unreadNotifications,
          recent: recentNotifications
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID (admin or self only)
// @access  Private
router.get('/:id', authorizeOwnerOrAdmin, [
  param('id').isUUID()
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

    const user = await User.findByPk(id, {
      attributes: { exclude: ['password', 'passwordResetToken', 'passwordResetExpires'] }
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/:id/deactivate
// @desc    Deactivate user account (admin only)
// @access  Private/Admin
router.put('/:id/deactivate', require('../middleware/auth').authorize('admin'), [
  param('id').isUUID()
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

    const user = await User.findByPk(id);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Prevent admin from deactivating themselves
    if (id === req.user.id) {
      return next(new AppError('Cannot deactivate your own account', 400));
    }

    await user.update({ isActive: false });

    securityLogger.userAction(req.user.id, 'deactivate_user', { targetUserId: id });

    res.json({
      success: true,
      message: 'User account deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/:id/activate
// @desc    Activate user account (admin only)
// @access  Private/Admin
router.put('/:id/activate', require('../middleware/auth').authorize('admin'), [
  param('id').isUUID()
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

    const user = await User.findByPk(id);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    await user.update({ isActive: true });

    securityLogger.userAction(req.user.id, 'activate_user', { targetUserId: id });

    res.json({
      success: true,
      message: 'User account activated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/settings/notifications
// @desc    Get user notification preferences
// @access  Private
router.get('/settings/notifications', async (req, res, next) => {
  try {
    // Return default notification preferences
    // In production, these would be stored in a user preferences table
    res.json({
      success: true,
      data: {
        preferences: {
          emailNotifications: true,
          pushNotifications: true,
          smsNotifications: false,
          applicationUpdates: true,
          documentStatus: true,
          paymentReminders: true,
          weeklyDigest: false,
          marketingEmails: false
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/settings/notifications
// @desc    Update user notification preferences
// @access  Private
router.put('/settings/notifications', async (req, res, next) => {
  try {
    const { emailNotifications, pushNotifications, smsNotifications, applicationUpdates, documentStatus, paymentReminders, weeklyDigest, marketingEmails } = req.body;

    // In production, save to database
    securityLogger.dataAccess(req.user.id, 'update', 'notification_preferences', req.ip);

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: {
        preferences: {
          emailNotifications,
          pushNotifications,
          smsNotifications,
          applicationUpdates,
          documentStatus,
          paymentReminders,
          weeklyDigest,
          marketingEmails
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/settings/account
// @desc    Get user account settings
// @access  Private
router.get('/settings/account', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'createdAt']
    });

    res.json({
      success: true,
      data: {
        settings: {
          language: 'en',
          timezone: 'UTC',
          dateFormat: 'MM/DD/YYYY',
          twoFactorAuth: false,
          loginAlerts: true
        },
        user
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/settings/account
// @desc    Update user account settings
// @access  Private
router.put('/settings/account', async (req, res, next) => {
  try {
    const { language, timezone, dateFormat } = req.body;

    // In production, save to database
    securityLogger.dataAccess(req.user.id, 'update', 'account_settings', req.ip);

    res.json({
      success: true,
      message: 'Account settings updated successfully',
      data: {
        settings: {
          language,
          timezone,
          dateFormat
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/settings/security
// @desc    Get user security settings
// @access  Private
router.get('/settings/security', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        settings: {
          twoFactorAuth: false,
          loginAlerts: true
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/settings/security
// @desc    Update user security settings
// @access  Private
router.put('/settings/security', async (req, res, next) => {
  try {
    const { twoFactorAuth, loginAlerts } = req.body;

    securityLogger.dataAccess(req.user.id, 'update', 'security_settings', req.ip);

    res.json({
      success: true,
      message: 'Security settings updated successfully',
      data: {
        settings: {
          twoFactorAuth,
          loginAlerts
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
