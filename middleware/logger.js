const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Define the format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// Define which transports the logger must use
const transports = [
  // Console transport for development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),

  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/all.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),

  // File transport for error logs
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),

  // File transport for HTTP logs
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/http.log'),
    level: 'http',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
];

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Express middleware for logging HTTP requests
const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, url, ip } = req;
    const { statusCode } = res;

    const message = `${method} ${url} ${statusCode} - ${duration}ms - IP: ${ip}`;

    if (statusCode >= 400) {
      logger.warn(message);
    } else {
      logger.http(message);
    }
  });

  next();
};

// Security event logger
const securityLogger = {
  loginAttempt: (email, ip, success) => {
    const level = success ? 'info' : 'warn';
    const message = `Login attempt - Email: ${email}, IP: ${ip}, Success: ${success}`;
    logger.log(level, message);
  },

  passwordChange: (userId, ip) => {
    logger.info(`Password changed - User ID: ${userId}, IP: ${ip}`);
  },

  unauthorizedAccess: (userId, resource, ip) => {
    logger.warn(`Unauthorized access attempt - User ID: ${userId || 'unknown'}, Resource: ${resource}, IP: ${ip}`);
  },

  dataAccess: (userId, action, resource, ip) => {
    logger.info(`Data access - User ID: ${userId}, Action: ${action}, Resource: ${resource}, IP: ${ip}`);
  },

  fileUpload: (userId, fileName, fileSize, ip) => {
    logger.info(`File uploaded - User ID: ${userId}, File: ${fileName}, Size: ${fileSize} bytes, IP: ${ip}`);
  },

  sensitiveDataAccess: (userId, dataType, ip) => {
    logger.warn(`Sensitive data access - User ID: ${userId}, Data Type: ${dataType}, IP: ${ip}`);
  }
};

// Audit logger for compliance
const auditLogger = {
  userAction: (userId, action, details) => {
    logger.info(`AUDIT: User Action - User ID: ${userId}, Action: ${action}, Details: ${JSON.stringify(details)}`);
  },

  adminAction: (adminId, action, targetUserId, details) => {
    logger.info(`AUDIT: Admin Action - Admin ID: ${adminId}, Action: ${action}, Target User: ${targetUserId}, Details: ${JSON.stringify(details)}`);
  },

  applicationStatusChange: (applicationId, oldStatus, newStatus, changedBy) => {
    logger.info(`AUDIT: Application Status Change - Application ID: ${applicationId}, From: ${oldStatus}, To: ${newStatus}, Changed By: ${changedBy}`);
  },

  paymentProcessed: (paymentId, amount, userId, processedBy) => {
    logger.info(`AUDIT: Payment Processed - Payment ID: ${paymentId}, Amount: ${amount}, User ID: ${userId}, Processed By: ${processedBy}`);
  },

  documentReviewed: (documentId, status, reviewedBy) => {
    logger.info(`AUDIT: Document Reviewed - Document ID: ${documentId}, Status: ${status}, Reviewed By: ${reviewedBy}`);
  }
};

module.exports = {
  logger,
  requestLogger,
  securityLogger,
  auditLogger
};

