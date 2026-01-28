'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('documents', 'rejection_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
      field: 'rejection_reason'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('documents', 'rejection_reason');
  }
};
