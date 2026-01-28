'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('applications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      visa_type: {
        type: Sequelize.ENUM('tourist', 'business', 'student', 'work', 'transit', 'family', 'diplomatic'),
        allowNull: false
      },
      application_number: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      status: {
        type: Sequelize.ENUM('draft', 'submitted', 'under_review', 'documents_required', 'biometrics_scheduled', 'biometrics_completed', 'approved', 'rejected', 'issued'),
        defaultValue: 'draft'
      },
      submission_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      processing_center: {
        type: Sequelize.STRING,
        allowNull: true
      },
      intended_date_of_arrival: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      intended_date_of_departure: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      purpose_of_visit: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      duration_of_stay: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      port_of_entry: {
        type: Sequelize.STRING,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      officer_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      decision_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      issue_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      expiry_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes
    await queryInterface.addIndex('applications', ['user_id']);
    await queryInterface.addIndex('applications', ['application_number']);
    await queryInterface.addIndex('applications', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('applications');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_applications_visa_type;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_applications_status;');
  }
};

