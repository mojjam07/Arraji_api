'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('applications', 'destination_country', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('applications', 'first_name', {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'first_name'
    });

    await queryInterface.addColumn('applications', 'last_name', {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'last_name'
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('applications', ['destination_country']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('applications', 'destination_country');
    await queryInterface.removeColumn('applications', 'first_name');
    await queryInterface.removeColumn('applications', 'last_name');
  }
};
