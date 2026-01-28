'use strict';

// Migration to add 'completed' status to the applications status enum
// This is needed because the application model now supports 'completed' status
// but the database enum might not have it yet.
//
// NOTE: This migration must preserve ALL existing status values from the original enum:
// - draft, submitted, under_review, documents_required
// - biometrics_scheduled, biometrics_completed
// - approved, rejected, issued
// And add: completed

const STATUS_VALUES = [
  'draft',
  'submitted',
  'under_review',
  'documents_required',
  'biometrics_scheduled',
  'biometrics_completed',
  'approved',
  'rejected',
  'completed',
  'issued'
];

const STATUS_VALUES_WITHOUT_COMPLETED = [
  'draft',
  'submitted',
  'under_review',
  'documents_required',
  'biometrics_scheduled',
  'biometrics_completed',
  'approved',
  'rejected',
  'issued'
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if enum type exists and add 'completed' value
    try {
      // First check if the enum type exists
      const checkEnum = await queryInterface.sequelize.query(`
        SELECT typname FROM pg_type WHERE typname = 'enum_applications_status';
      `);

      if (checkEnum[0].length > 0) {
        // Check if 'completed' already exists
        const checkCompleted = await queryInterface.sequelize.query(`
          SELECT enumlabel FROM pg_enum
          WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_applications_status')
          AND enumlabel = 'completed';
        `);

        if (checkCompleted[0].length > 0) {
          console.log('ℹ️ "completed" status already exists in enum');
          return;
        }

        // PostgreSQL 15+ can use ALTER TYPE ADD VALUE directly
        // For older versions, we need to recreate the enum type
        try {
          await queryInterface.sequelize.query(`
            ALTER TYPE enum_applications_status ADD VALUE IF NOT EXISTS 'completed';
          `);
          console.log('✅ Successfully added "completed" to enum_applications_status (PostgreSQL 15+ method)');
        } catch (pg15Error) {
          // Fallback for PostgreSQL < 15: recreate the enum type
          console.log('⚠️ PostgreSQL 15+ method failed, using recreation method');
          
          await queryInterface.sequelize.transaction(async (t) => {
            // Get current enum values
            const currentValues = await queryInterface.sequelize.query(`
              SELECT enumlabel FROM pg_enum
              WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_applications_status')
              ORDER BY enumsortorder;
            `, { transaction: t });
            
            const currentValueList = currentValues[0].map(v => v.enumlabel);
            console.log('Current enum values:', currentValueList);

            // Build the new enum values (existing + completed)
            const existingValues = [...currentValueList];
            if (!existingValues.includes('completed')) {
              existingValues.push('completed');
            }

            // Rename old enum type
            await queryInterface.sequelize.query(`
              ALTER TYPE enum_applications_status RENAME TO enum_applications_status_old;
            `, { transaction: t });

            // Create new enum type with all existing values plus completed
            const newEnumValues = existingValues.map(v => `'${v}'`).join(', ');
            await queryInterface.sequelize.query(`
              CREATE TYPE enum_applications_status AS ENUM (${newEnumValues});
            `, { transaction: t });

            // Update the column to use new enum
            await queryInterface.sequelize.query(`
              ALTER TABLE applications ALTER COLUMN status TYPE enum_applications_status USING status::text::enum_applications_status;
            `, { transaction: t });

            // Drop old enum type
            await queryInterface.sequelize.query(`
              DROP TYPE IF EXISTS enum_applications_status_old;
            `, { transaction: t });
          });
          console.log('✅ Successfully added "completed" to enum_applications_status (recreation method)');
        }
      } else {
        console.log('ℹ️ enum_applications_status does not exist yet, will be created by model sync');
      }
    } catch (error) {
      console.log('⚠️ Migration note:', error.message);
      throw error; // Re-throw to ensure migration is marked as failed
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check if enum type exists
      const checkEnum = await queryInterface.sequelize.query(`
        SELECT typname FROM pg_type WHERE typname = 'enum_applications_status';
      `);

      if (checkEnum[0].length === 0) {
        console.log('ℹ️ enum_applications_status does not exist, nothing to revert');
        return;
      }

      // Check if 'completed' exists
      const checkCompleted = await queryInterface.sequelize.query(`
        SELECT enumlabel FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_applications_status')
        AND enumlabel = 'completed';
      `);

      if (checkCompleted[0].length === 0) {
        console.log('ℹ️ "completed" status does not exist, nothing to revert');
        return;
      }

      await queryInterface.sequelize.transaction(async (t) => {
        // Get current enum values
        const currentValues = await queryInterface.sequelize.query(`
          SELECT enumlabel FROM pg_enum
          WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_applications_status')
          ORDER BY enumsortorder;
        `, { transaction: t });
        
        // Filter out 'completed' from the list
        const existingValues = currentValues[0]
          .map(v => v.enumlabel)
          .filter(v => v !== 'completed');

        console.log('Values after removing completed:', existingValues);

        // Rename old enum type
        await queryInterface.sequelize.query(`
          ALTER TYPE enum_applications_status RENAME TO enum_applications_status_old;
        `, { transaction: t });

        // Create new enum type without 'completed'
        const newEnumValues = existingValues.map(v => `'${v}'`).join(', ');
        await queryInterface.sequelize.query(`
          CREATE TYPE enum_applications_status AS ENUM (${newEnumValues});
        `, { transaction: t });

        // Update the column to use new enum
        await queryInterface.sequelize.query(`
          ALTER TABLE applications ALTER COLUMN status TYPE enum_applications_status USING status::text::enum_applications_status;
        `, { transaction: t });

        // Drop old enum type
        await queryInterface.sequelize.query(`
          DROP TYPE IF EXISTS enum_applications_status_old;
        `, { transaction: t });
      });
      console.log('✅ Successfully removed "completed" from enum_applications_status');
    } catch (error) {
      console.log('⚠️ Reverse migration note:', error.message);
      throw error;
    }
  }
};

