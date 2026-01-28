'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, set NULL values to true (consistent with defaultValue and existing behavior)
    await queryInterface.sequelize.query(`
      UPDATE users SET is_active = true WHERE is_active IS NULL;
    `);

    // Then change the column to NOT NULL
    await queryInterface.changeColumn('users', 'is_active', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false,  // Enforce NOT NULL for data integrity
      after: 'address'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert to allow NULL
    await queryInterface.changeColumn('users', 'is_active', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: true,
      after: 'address'
    });
  }
};

