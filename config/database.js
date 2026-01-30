const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;

// Helper function to create Sequelize instance with common options
const createSequelizeInstance = (dbUrl, options = {}) => {
  return new Sequelize(dbUrl, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 5,
      min: parseInt(process.env.DB_POOL_MIN) || 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: true
    },
    // Security: Prevent SQL injection through model manipulation
    schema: process.env.DB_SCHEMA || 'public',
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    retry: {
      match: [
        /ECONNREFUSED/,
        /ENOTFOUND/,
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ENETUNREACH/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/
      ],
      max: 5, // Maximum retry attempts
      backoffBase: 1000, // Initial backoff in ms
      backoffExponent: 2, // Exponential backoff multiplier
    },
    ...options
  });
};

// Check if DATABASE_URL is provided (for Render deployment)
if (process.env.DATABASE_URL) {
  console.log('Using DATABASE_URL for database connection');
  sequelize = createSequelizeInstance(process.env.DATABASE_URL);
} else {
  // Fallback to individual environment variables (for local development)
  const requiredEnvVars = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT'];
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    console.error('❌ SECURITY ERROR: Missing required environment variables:');
    missingEnvVars.forEach(envVar => console.error(`   - ${envVar}`));
    console.error('Please create a .env file with these variables or use DATABASE_URL.');
    process.exit(1);
  }

  // Database configuration for local development
  const dbUrl = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
  console.log('Using individual environment variables for database connection');
  sequelize = createSequelizeInstance(dbUrl, {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10)
  });
}

// Connection event handlers for better debugging
sequelize.on('error', (err) => {
  console.error('Sequelize connection error:', err.message);
});

sequelize.on('connectionError', (err) => {
  console.error('Sequelize connection manager error:', err.message);
});

sequelize.on('disconnected', () => {
  console.warn('Sequelize connection disconnected - will attempt to reconnect on next operation');
});

module.exports = sequelize;
