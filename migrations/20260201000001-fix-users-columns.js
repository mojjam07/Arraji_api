'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Change is_active column to NOT NULL with default value
    await queryInterface.changeColumn('users', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
    
    // Also add is_verified column if it doesn't exist (for users created before the column was added)
    try {
      await queryInterface.addColumn('users', 'is_verified', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        after: 'is_active'
      });
    } catch (error) {
      // Column might already exist, that's OK
      console.log('is_verified column might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    // Revert to allow null
    await queryInterface.changeColumn('users', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: true
    });
    
    // Remove is_verified column
    await queryInterface.removeColumn('users', 'is_verified');
  }
};

