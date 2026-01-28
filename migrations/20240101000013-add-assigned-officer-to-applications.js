'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add assigned_officer_id column to applications table
    await queryInterface.addColumn('applications', 'assigned_officer_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    });

    // Add index for better query performance
    await queryInterface.addIndex('applications', ['assigned_officer_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('applications', 'assigned_officer_id');
  }
};

