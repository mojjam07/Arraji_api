'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

// Import the SINGLE sequelize instance from database.js
// This ensures all models use the same connection throughout the app
const sequelize = require('../config/database');

const basename = path.basename(__filename);
const db = {};

// Load all models and associate them with the existing sequelize instance
const User = require('./User')(sequelize, Sequelize.DataTypes);
const Application = require('./Application')(sequelize, Sequelize.DataTypes);
const Payment = require('./Payment')(sequelize, Sequelize.DataTypes);
const Document = require('./Document')(sequelize, Sequelize.DataTypes);
const BiometricAppointment = require('./BiometricAppointment')(sequelize, Sequelize.DataTypes);
const Notification = require('./Notification')(sequelize, Sequelize.DataTypes);

// Add models to db object
db.User = User;
db.Application = Application;
db.Payment = Payment;
db.Document = Document;
db.BiometricAppointment = BiometricAppointment;
db.Notification = Notification;

// Set up associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Re-export sequelize instance for compatibility
db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

