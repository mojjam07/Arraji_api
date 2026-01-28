'use strict';

const { Model } = require('sequelize');

// Valid application statuses
const VALID_STATUSES = ['draft', 'submitted', 'under_review', 'documents_required', 'biometrics_scheduled', 'biometrics_completed', 'approved', 'rejected', 'completed', 'issued'];

module.exports = (sequelize, DataTypes) => {
  class Application extends Model {
    static associate(models) {
      Application.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      Application.belongsTo(models.User, { foreignKey: 'assignedOfficerId', as: 'assignedOfficer' });
      Application.hasMany(models.Payment, { foreignKey: 'applicationId', as: 'payments' });
      Application.hasMany(models.Document, { foreignKey: 'applicationId', as: 'documents' });
      Application.hasOne(models.BiometricAppointment, { foreignKey: 'applicationId', as: 'biometricAppointment' });
    }

    // Static method to get valid statuses
    static getValidStatuses() {
      return VALID_STATUSES;
    }
  }

  Application.init({
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
    visaType: {
      type: DataTypes.ENUM('tourist', 'business', 'student', 'work', 'transit', 'family', 'diplomatic'),
      allowNull: false,
      field: 'visa_type'
    },
    applicationNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'application_number'
    },
    status: {
      type: DataTypes.ENUM('draft', 'submitted', 'under_review', 'documents_required', 'biometrics_scheduled', 'biometrics_completed', 'approved', 'rejected', 'completed', 'issued'),
      defaultValue: 'draft'
    },
    submissionDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'submission_date'
    },
    processingCenter: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'processing_center'
    },
    intendedDateOfArrival: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'intended_date_of_arrival'
    },
    intendedDateOfDeparture: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'intended_date_of_departure'
    },
    purposeOfVisit: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'purpose_of_visit'
    },
    durationOfStay: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_of_stay'
    },
    portOfEntry: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'port_of_entry'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    officerNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'officer_notes'
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason'
    },
    decisionDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'decision_date'
    },
    issueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'issue_date'
    },
    expiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'expiry_date'
    },
    destinationCountry: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'destination_country'
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'first_name'
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'last_name'
    },
    // Cost estimation fields
    processingFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      field: 'processing_fee'
    },
    biometricsFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      field: 'biometrics_fee'
    },
    serviceFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      field: 'service_fee'
    },
    courierFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      field: 'courier_fee'
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      field: 'total_cost'
    },
    costProvidedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'cost_provided_at'
    },
    paymentDeadline: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'payment_deadline'
    },
    // Approval and processing timestamps
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at'
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejected_at'
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at'
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'assigned_at'
    },
    // Processing fields
    processingNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'processing_notes'
    },
    biometricsDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'biometrics_date'
    },
    embassySubmissionDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'embassy_submission_date'
    },
    // Additional cost fields (legacy)
    cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
      field: 'cost'
    },
    paymentDueDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'payment_due_date'
    },
    fullName: {
      type: DataTypes.VIRTUAL,
      get() {
        if (this.firstName && this.lastName) {
          return `${this.firstName} ${this.lastName}`;
        }
        return this.firstName || this.lastName || 'N/A';
      },
      set(value) {
        // Allow setting fullName as a convenience, but it won't be stored
      }
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
    modelName: 'Application',
    tableName: 'applications',
    timestamps: true,
    underscored: true
  });

  return Application;
};

