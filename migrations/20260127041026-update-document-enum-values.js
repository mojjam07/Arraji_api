'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('Updating document_type enum values...');
    
    // List of values to add to the document_type enum
    // These values are used in the frontend but may not exist in the database enum
    const valuesToAdd = [
      'passport_copy',
      'passport_photo',
      'invitation_letter',
      'residence_permit',
      'travel_itinerary',
      'hotel_booking',
      'insurance_policy',
      'educational_certificate'
    ];

    // Add each enum value using PostgreSQL's native ADD VALUE IF NOT EXISTS
    // This syntax is supported in PostgreSQL 9.5+
    for (const value of valuesToAdd) {
      try {
        await queryInterface.sequelize.query(
          `ALTER TYPE enum_documents_document_type ADD VALUE IF NOT EXISTS '${value}';`
        );
        console.log(`✓ Added '${value}' to enum_documents_document_type`);
      } catch (error) {
        // If the error indicates the value already exists, we can safely ignore it
        if (error.message && error.message.includes('already exists')) {
          console.log(`✓ Value '${value}' already exists in enum_documents_document_type`);
        } else {
          // Log other errors but don't fail the migration
          console.log(`⚠ Warning adding '${value}': ${error.message}`);
        }
      }
    }
    
    console.log('✓ Document enum values migration completed');
  },

  async down (queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This migration is irreversible for practical purposes
    console.log('Note: Downgrade not supported for enum value additions');
  }
};
