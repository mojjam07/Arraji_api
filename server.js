require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cookieParser = require('cookie-parser');

// Import database connection - THIS IS THE SINGLE INSTANCE
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
// This uses the SAME sequelize instance from config/database.js
require('./models');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');

const app = express();

// Trust proxy - Required for accurate IP detection behind load balancers/proxies (e.g., Render)
// This fixes the X-Forwarded-For header validation error from express-rate-limit
app.set('trust proxy', 1);

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

// CORS configuration - Allow multiple origins for development and production
const allowedOrigins = [
  'http://localhost:5173',
  'https://ar-raji.vercel.app',
  // 'https://www.ar-raji.vercel.app' // Uncomment when custom domain is set up
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    // or requests from allowed origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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

// Health check endpoint
app.get('/api/test', (req, res) => {
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

const startServer = async () => {
  try {
    // Test database connection with detailed logging
    console.log('🔌 [SERVER] Attempting to connect to database...');
    
    try {
      await sequelize.authenticate();
      console.log('✅ [SERVER] Database connection established successfully.');
    } catch (error) {
      console.error('❌ [SERVER] Unable to connect to database:');
      console.error('   Error name:', error.name);
      console.error('   Error message:', error.message);
      console.error('   This is likely a configuration issue.');
      console.error('   Please check:');
      console.error('   - DATABASE_URL environment variable is set');
      console.error('   - Database server is running and accessible');
      console.error('   - Network/firewall rules allow connection');
      
      // Don't exit immediately in development, allow the server to start anyway
      // This helps with debugging connection issues
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
      console.warn('⚠️  [SERVER] Starting server WITHOUT database connection (development mode)');
    }

    // Sync database / Run migrations based on environment
    if (process.env.NODE_ENV === 'development' && sequelize) {
      // Development: Use sync with alter to auto-update tables
      try {
        await sequelize.sync({ alter: true });
        console.log('✅ [SERVER] Database synchronized successfully (development mode).');
      } catch (error) {
        console.warn('⚠️  [SERVER] Database sync failed:', error.message);
      }
    } else if (process.env.NODE_ENV === 'production') {
      // Production: Use Sequelize CLI migrations for reliable schema updates
      try {
        console.log('🚀 [SERVER] Running database migrations...');
        
        // Use sequelize-cli to run migrations
        const { execSync } = require('child_process');
        
        // Run migrations using npx sequelize-cli
        const migrateCommand = 'npx sequelize-cli db:migrate';
        execSync(migrateCommand, {
          env: process.env,
          stdio: 'inherit',
          cwd: __dirname
        });
        
        console.log('✅ [SERVER] Database migrations completed successfully.');
        
        // Optional: Run seed data if RUN_SEED environment variable is set to 'true'
        if (process.env.RUN_SEED === 'true') {
          try {
            console.log('🌱 [SERVER] Running seed data...');
            const seedCommand = 'node seed.js';
            execSync(seedCommand, {
              env: process.env,
              stdio: 'inherit',
              cwd: __dirname
            });
            console.log('✅ [SERVER] Seed data completed successfully.');
          } catch (seedError) {
            console.warn('⚠️  [SERVER] Seed data failed:', seedError.message);
            console.warn('   This may be expected if data already exists.');
          }
        }
      } catch (error) {
        console.error('❌ [SERVER] Database migration failed:', error.message);
        console.error('   Please check migration files and database connection.');
        
        // In production, we should exit if migrations fail
        // This ensures we don't run with an inconsistent database schema
        process.exit(1);
      }
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 [SERVER] Server is running on port ${PORT}`);
      console.log(`🌍 [SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📡 [SERVER] API available at: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ [SERVER] Unable to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ [SERVER] Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [SERVER] Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();

module.exports = app;

