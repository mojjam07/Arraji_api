'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Step 1: Drop the old enum type and column default first (CASCADE drops dependent objects)
    await queryInterface.sequelize.query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS "enum_notifications_type";');
    await queryInterface.sequelize.query('ALTER TABLE notifications ALTER COLUMN type DROP DEFAULT;');

    // Step 2: Change the column type to TEXT
    await queryInterface.sequelize.query('ALTER TABLE notifications ALTER COLUMN type TYPE TEXT;');

    // Step 3: Update existing rows to map old enum values to new values
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'application_status_update' WHERE type = 'application_update';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'payment_reminder' WHERE type = 'payment';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'document_request' WHERE type = 'document';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'biometrics_scheduled' WHERE type = 'biometrics';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'general_announcement' WHERE type = 'general';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'payment_reminder' WHERE type = 'reminder';
    `);

    // Step 4: Drop the old enum type (if still exists)
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_notifications_type CASCADE;');

    // Step 5: Create new enum type with all required notification types
    await queryInterface.sequelize.query(`
      CREATE TYPE enum_notifications_type AS ENUM (
        'application_status_update',
        'document_request',
        'payment_reminder',
        'biometrics_scheduled',
        'biometrics_reminder',
        'application_approved',
        'application_rejected',
        'document_approved',
        'document_rejected',
        'payment_completed',
        'general_announcement'
      );
    `);

    // Step 6: Change the type column from TEXT to the new enum using ALTER TABLE
    // This avoids Sequelize's casting issue
    await queryInterface.sequelize.query(`
      ALTER TABLE notifications ALTER COLUMN type TYPE enum_notifications_type USING type::enum_notifications_type;
    `);

    // Step 7: Set the default value
    await queryInterface.sequelize.query(`
      ALTER TABLE notifications ALTER COLUMN type SET DEFAULT 'general_announcement';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Step 1: Drop the new enum constraint and default
    await queryInterface.sequelize.query('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS "enum_notifications_type";');
    await queryInterface.sequelize.query('ALTER TABLE notifications ALTER COLUMN type DROP DEFAULT;');

    // Step 2: Change the column type to TEXT
    await queryInterface.sequelize.query('ALTER TABLE notifications ALTER COLUMN type TYPE TEXT;');

    // Step 3: Update rows to map new enum values back to old enum values
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'application_update' WHERE type = 'application_status_update';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'payment' WHERE type = 'payment_reminder' OR type = 'payment_completed';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'document' WHERE type = 'document_request' OR type = 'document_approved' OR type = 'document_rejected';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'biometrics' WHERE type = 'biometrics_scheduled' OR type = 'biometrics_reminder';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'general' WHERE type = 'general_announcement';
    `);
    await queryInterface.sequelize.query(`
      UPDATE notifications SET type = 'reminder' WHERE type = 'payment_reminder';
    `);

    // Step 4: Drop the new enum type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_notifications_type CASCADE;');

    // Step 5: Restore the old enum type
    await queryInterface.sequelize.query(`
      CREATE TYPE enum_notifications_type AS ENUM (
        'application_update',
        'payment',
        'document',
        'biometrics',
        'general',
        'reminder'
      );
    `);

    // Step 6: Change the type column from TEXT to the old enum
    await queryInterface.sequelize.query(`
      ALTER TABLE notifications ALTER COLUMN type TYPE enum_notifications_type USING type::enum_notifications_type;
    `);

    // Step 7: Restore the default value
    await queryInterface.sequelize.query(`
      ALTER TABLE notifications ALTER COLUMN type SET DEFAULT 'general';
    `);
  }
};

