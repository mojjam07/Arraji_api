'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('biometric_appointments', {
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
      application_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'applications',
          key: 'id'
        }
      },
      appointment_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      appointment_time: {
        type: Sequelize.TIME,
        allowNull: false
      },
      location: {
        type: Sequelize.STRING,
        allowNull: false
      },
      center_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      center_address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'),
        defaultValue: 'scheduled'
      },
      confirmation_number: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      reminder_sent: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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
    await queryInterface.addIndex('biometric_appointments', ['user_id']);
    await queryInterface.addIndex('biometric_appointments', ['application_id']);
    await queryInterface.addIndex('biometric_appointments', ['status']);
    await queryInterface.addIndex('biometric_appointments', ['appointment_date']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('biometric_appointments');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_biometric_appointments_status;');
  }
};

