require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cookieParser = require('cookie-parser');

// Log environment status
console.log('🔧 Server starting...');
console.log('📍 Node environment:', process.env.NODE_ENV || 'development');
console.log('🔑 JWT_SECRET loaded:', process.env.JWT_SECRET ? 'YES (length: ' + process.env.JWT_SECRET.length + ')' : 'NO - CHECK .env FILE!');
console.log('🌐 Frontend URL:', process.env.FRONTEND_URL || 'http://localhost:5173');
console.log('🗄️ Database config:', process.env.DB_HOST ? 'configured' : 'using default');

// Import database connection
const sequelize = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const applicationRoutes = require('./routes/applications');
const biometricsRoutes = require('./routes/biometrics');
const paymentRoutes = require('./routes/payments');
const documentRoutes = require('./routes/documents');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');

// Import models to ensure associations are loaded
require('./models');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');

const app = express();

// Security middleware with comprehensive headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
  noSniff: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
};
app.use(cors(corsOptions));

// Cookie parser for httpOnly cookies
app.use(cookieParser());

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  const escapeHtml = (str) => {
    if (typeof str !== 'string') return str;
    const htmlEscapes = {
      '&': '&amp;',
      '<': '<',
      '>': '>',
      '"': '"',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };
    return str.replace(/[&<>"'`=/]/g, (char) => htmlEscapes[char]);
  };

  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return escapeHtml(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitize(obj[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

app.use(sanitizeInput);

// Rate limiting - Stricter limits for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per 15 minutes for auth endpoints (login/register/forgot-password)
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// More permissive rate limiter for auth verification endpoint (/me)
// This needs higher limits because it's called on every page load
const authMeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per minute for /api/auth/me
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use both IP and user ID if authenticated to allow different limits per user
    if (req.user && req.user.id) {
      return `user_${req.user.id}`;
    }
    return req.ip;
  }
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for general API
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply stricter rate limiting to auth routes (login/register/forgot-password)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// Apply more permissive rate limiting to /api/auth/me endpoint
// This must be applied before the general limiter
app.use('/api/auth/me', authMeLimiter);

// Apply general rate limiting to other API routes
app.use('/api/', generalLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// NOTE: File upload is handled by multer in document routes
// Removed express-fileupload middleware to avoid conflicts with multer

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logging middleware
app.use(requestLogger);

// IMMEDIATE REQUEST LOGGING - logs every request immediately
app.use((req, res, next) => {
  console.log(`📥 INCOMING REQUEST: ${req.method} ${req.url} from ${req.ip}`);
  console.log(`   Headers: Origin=${req.get('Origin')}, Content-Type=${req.get('Content-Type')}`);
  next();
});

// Health check endpoint - TEST THIS FIRST
app.get('/api/test', (req, res) => {
  console.log('✅ Test endpoint hit from:', req.ip);
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    headers: {
      'Content-Type': req.get('Content-Type'),
      'Origin': req.get('Origin') || 'none'
    }
  });
});

// Debug endpoint to check environment
app.get('/api/debug', (req, res) => {
  console.log('✅ Debug endpoint hit');
  res.status(200).json({
    env: {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET_SET: !!process.env.JWT_SECRET,
      JWT_SECRET_LENGTH: process.env.JWT_SECRET?.length || 0,
      FRONTEND_URL: process.env.FRONTEND_URL
    }
  });
});

// Debug endpoint to check database status
app.get('/api/debug/db', async (req, res) => {
  try {
    const { User } = require('./models');
    const userCount = await User.count();
    const users = await User.findAll({
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    res.status(200).json({
      status: 'OK',
      database: 'connected',
      userCount,
      recentUsers: users,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database debug error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: error.message,
      database: 'disconnected'
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/biometrics', biometricsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Error handling middleware
app.use(errorHandler);

// Database connection and server start
const PORT = process.env.PORT || 5000;

// Log port information for debugging
console.log(`🚀 Starting server on port: ${PORT}`);

const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Sync database (in development)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('Database synchronized successfully.');
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
