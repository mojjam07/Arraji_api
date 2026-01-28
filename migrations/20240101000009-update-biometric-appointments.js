'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add scheduledBy column
    await queryInterface.addColumn('biometric_appointments', 'scheduled_by', {
      type: Sequelize.UUID,
      references: {
        model: 'users',
        key: 'id'
      },
      allowNull: true
    });

    // Add completedBy column
    await queryInterface.addColumn('biometric_appointments', 'completed_by', {
      type: Sequelize.UUID,
      references: {
        model: 'users',
        key: 'id'
      },
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('biometric_appointments', 'scheduled_by');
    await queryInterface.removeColumn('biometric_appointments', 'completed_by');
  }
};

