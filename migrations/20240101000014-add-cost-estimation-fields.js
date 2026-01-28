'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('applications');

    // Add processing_fee column if it doesn't exist
    if (!tableDescription.processing_fee) {
      await queryInterface.addColumn('applications', 'processing_fee', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'processing_fee'
      });
    }

    // Add biometrics_fee column if it doesn't exist
    if (!tableDescription.biometrics_fee) {
      await queryInterface.addColumn('applications', 'biometrics_fee', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'biometrics_fee'
      });
    }

    // Add service_fee column if it doesn't exist
    if (!tableDescription.service_fee) {
      await queryInterface.addColumn('applications', 'service_fee', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'service_fee'
      });
    }

    // Add courier_fee column if it doesn't exist
    if (!tableDescription.courier_fee) {
      await queryInterface.addColumn('applications', 'courier_fee', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'courier_fee'
      });
    }

    // Add total_cost column if it doesn't exist
    if (!tableDescription.total_cost) {
      await queryInterface.addColumn('applications', 'total_cost', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        field: 'total_cost'
      });
    }

    // Add cost_provided_at column if it doesn't exist
    if (!tableDescription.cost_provided_at) {
      await queryInterface.addColumn('applications', 'cost_provided_at', {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'cost_provided_at'
      });
    }

    // Add payment_deadline column if it doesn't exist
    if (!tableDescription.payment_deadline) {
      await queryInterface.addColumn('applications', 'payment_deadline', {
        type: Sequelize.DATEONLY,
        allowNull: true,
        field: 'payment_deadline'
      });
    }

    // Add cost_provided status to enum if it doesn't exist
    try {
      const checkEnum = await queryInterface.sequelize.query(`
        SELECT typname FROM pg_type WHERE typname = 'enum_applications_status';
      `);

      if (checkEnum[0].length > 0) {
        const checkCostProvided = await queryInterface.sequelize.query(`
          SELECT enumlabel FROM pg_enum
          WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_applications_status')
          AND enumlabel = 'cost_provided';
        `);

        if (checkCostProvided[0].length === 0) {
          try {
            await queryInterface.sequelize.query(`
              ALTER TYPE enum_applications_status ADD VALUE IF NOT EXISTS 'cost_provided';
            `);
            console.log('✅ Successfully added "cost_provided" to enum_applications_status');
          } catch (error) {
            console.log('⚠️ Could not add cost_provided status to enum:', error.message);
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Enum check note:', error.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('applications', 'processing_fee');
    await queryInterface.removeColumn('applications', 'biometrics_fee');
    await queryInterface.removeColumn('applications', 'service_fee');
    await queryInterface.removeColumn('applications', 'courier_fee');
    await queryInterface.removeColumn('applications', 'total_cost');
    await queryInterface.removeColumn('applications', 'cost_provided_at');
    await queryInterface.removeColumn('applications', 'payment_deadline');
  }
};

