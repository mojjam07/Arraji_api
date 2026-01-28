'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BiometricAppointment extends Model {
    static associate(models) {
      BiometricAppointment.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      BiometricAppointment.belongsTo(models.Application, { foreignKey: 'applicationId', as: 'application' });
      BiometricAppointment.belongsTo(models.User, { foreignKey: 'scheduledBy', as: 'scheduledByUser' });
      BiometricAppointment.belongsTo(models.User, { foreignKey: 'completedBy', as: 'completedByUser' });
    }
  }

BiometricAppointment.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'application_id',
      references: {
        model: 'applications',
        key: 'id'
      }
    },
    appointmentDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'appointment_date'
    },
    appointmentTime: {
      type: DataTypes.TIME,
      allowNull: false,
      field: 'appointment_time'
    },
    location: {
      type: DataTypes.STRING,
      allowNull: false
    },
    centerName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'center_name'
    },
    centerAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'center_address'
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'),
      defaultValue: 'scheduled'
    },
    confirmationNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      field: 'confirmation_number'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    scheduledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'scheduled_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    completedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'completed_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at'
    },
    reminderSent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'reminder_sent'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    sequelize,
    modelName: 'BiometricAppointment',
    tableName: 'biometric_appointments',
    timestamps: true,
    underscored: true
  });

  return BiometricAppointment;
};

