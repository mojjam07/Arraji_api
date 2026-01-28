'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('documents', {
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
      document_type: {
        type: Sequelize.ENUM('passport', 'passport_photo', 'passport_copy', 'photo', 'id_card', 'birth_certificate', 'marriage_certificate', 'employment_letter', 'bank_statement', 'travel_insurance', 'travel_itinerary', 'flight_itinerary', 'hotel_booking', 'invitation_letter', 'insurance_policy', 'educational_certificate', 'other'),
        allowNull: false
      },
      file_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      original_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      file_path: {
        type: Sequelize.STRING,
        allowNull: false
      },
      file_size: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      mime_type: {
        type: Sequelize.STRING,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
      },
      verification_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      uploaded_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      verified_at: {
        type: Sequelize.DATE,
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
    await queryInterface.addIndex('documents', ['user_id']);
    await queryInterface.addIndex('documents', ['application_id']);
    await queryInterface.addIndex('documents', ['document_type']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('documents');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_documents_document_type;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_documents_status;');
  }
};

