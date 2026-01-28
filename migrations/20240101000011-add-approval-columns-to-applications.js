'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('applications');

    // Add approved_at column if it doesn't exist
    if (!tableDescription.approved_at) {
      await queryInterface.addColumn('applications', 'approved_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    // Add rejected_at column if it doesn't exist
    if (!tableDescription.rejected_at) {
      await queryInterface.addColumn('applications', 'rejected_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    // Add reviewed_at column if it doesn't exist
    if (!tableDescription.reviewed_at) {
      await queryInterface.addColumn('applications', 'reviewed_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    // Add assigned_at column if it doesn't exist
    if (!tableDescription.assigned_at) {
      await queryInterface.addColumn('applications', 'assigned_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    // Add processing_notes column if it doesn't exist
    if (!tableDescription.processing_notes) {
      await queryInterface.addColumn('applications', 'processing_notes', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    // Add cost column if it doesn't exist
    if (!tableDescription.cost) {
      await queryInterface.addColumn('applications', 'cost', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null
      });
    }

    // Add payment_due_date column if it doesn't exist
    if (!tableDescription.payment_due_date) {
      await queryInterface.addColumn('applications', 'payment_due_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      });
    }

    // Add embassy_submission_date column if it doesn't exist
    if (!tableDescription.embassy_submission_date) {
      await queryInterface.addColumn('applications', 'embassy_submission_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      });
    }

    // Add biometrics_date column if it doesn't exist
    if (!tableDescription.biometrics_date) {
      await queryInterface.addColumn('applications', 'biometrics_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      });
    }

    // Add indexes for better query performance if they don't exist
    const indexes = await queryInterface.showIndex('applications');
    const indexNames = indexes.map(index => index.name);

    if (!indexNames.includes('applications_approved_at')) {
      await queryInterface.addIndex('applications', ['approved_at']);
    }
    if (!indexNames.includes('applications_rejected_at')) {
      await queryInterface.addIndex('applications', ['rejected_at']);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('applications', 'approved_at');
    await queryInterface.removeColumn('applications', 'rejected_at');
    await queryInterface.removeColumn('applications', 'reviewed_at');
    await queryInterface.removeColumn('applications', 'assigned_at');
    await queryInterface.removeColumn('applications', 'processing_notes');
    await queryInterface.removeColumn('applications', 'cost');
    await queryInterface.removeColumn('applications', 'payment_due_date');
    await queryInterface.removeColumn('applications', 'embassy_submission_date');
    await queryInterface.removeColumn('applications', 'biometrics_date');
  }
};

