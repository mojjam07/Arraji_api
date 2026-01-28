const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { AppError } = require('./errorHandler');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    let token;
    let tokenSource = 'none';

    // Check for token in header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      tokenSource = 'authorization_header';
    }

    // Check for token in cookies (httpOnly cookie for additional security)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
      tokenSource = 'cookie';
    }

    // Make sure token exists
    if (!token) {
      console.log('🔒 Auth: No token found in request');
      console.log('🔒 Auth: Token source:', tokenSource);
      return next(new AppError('Not authorized to access this route', 401));
    }

    console.log('🔓 Auth: Token found from', tokenSource, '- Length:', token.length);

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('🔓 Auth: Token verified successfully');

      // Get user from token
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      if (!user) {
        console.log('🔒 Auth: User not found for token ID:', decoded.id);
        return next(new AppError('No user found with this token', 401));
      }

      // Check if user is active - handle undefined isActive as active
      const isUserActive = user.isActive === undefined || user.isActive === true;
      if (!isUserActive) {
        console.log('🔒 Auth: User account is deactivated:', user.email);
        return next(new AppError('User account is deactivated', 401));
      }

      req.user = user;
      next();
    } catch (err) {
      console.log('🔒 Auth: Token verification failed:', err.name);
      
      if (err.name === 'TokenExpiredError') {
        return next(new AppError('Token has expired', 401));
      }
      if (err.name === 'JsonWebTokenError') {
        return next(new AppError('Invalid token', 401));
      }
      return next(new AppError('Not authorized to access this route', 401));
    }
  } catch (err) {
    console.error('🔒 Auth: Server error during authentication:', err.message);
    return next(new AppError('Server error during authentication', 500));
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(`User role ${req.user.role} is not authorized to access this route`, 403));
    }

    next();
  };
};

// Check if user owns resource or is admin
const authorizeOwnerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('User not authenticated', 401));
  }

  // Admin can access everything
  if (req.user.role === 'admin') {
    return next();
  }

  // Check if user owns the resource (assuming req.params.id is the resource owner)
  if (req.user.id !== parseInt(req.params.id || req.params.userId || req.body.userId)) {
    return next(new AppError('Not authorized to access this resource', 403));
  }

  next();
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.id, {
          attributes: { exclude: ['password'] }
        });

        if (user) {
          // Handle undefined isActive as active (consistent with protect middleware)
          const isUserActive = user.isActive === undefined || user.isActive === true;
          if (isUserActive) {
            req.user = user;
          }
        }
      } catch (err) {
        // Token invalid but don't fail
      }
    }

    next();
  } catch (err) {
    next();
  }
};

module.exports = {
  protect,
  authorize,
  authorizeOwnerOrAdmin,
  optionalAuth
};

