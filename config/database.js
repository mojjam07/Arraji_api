const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;

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
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production'
        ? { require: true, rejectUnauthorized: false }
        : false
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
      max: 5
    },
    ...options
  });
};

if (process.env.DATABASE_URL) {
  console.log('🔧 [DATABASE] Using DATABASE_URL for database connection');
  sequelize = createSequelizeInstance(process.env.DATABASE_URL);
} else {
  const dbUrl = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
  console.log('🔧 [DATABASE] Using individual environment variables');
  sequelize = createSequelizeInstance(dbUrl);
}

module.exports = sequelize;
