'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add status column to notifications table (replacing isRead)
    await queryInterface.addColumn('notifications', 'notification_status', {
      type: Sequelize.ENUM('unread', 'read', 'archived'),
      defaultValue: 'unread'
    });

    // Add applicationId column to notifications
    await queryInterface.addColumn('notifications', 'application_id', {
      type: Sequelize.UUID,
      references: {
        model: 'applications',
        key: 'id'
      },
      allowNull: true
    });

    // Add createdBy column to notifications
    await queryInterface.addColumn('notifications', 'created_by', {
      type: Sequelize.UUID,
      references: {
        model: 'users',
        key: 'id'
      },
      allowNull: true
    });

    // Remove old isRead column if it exists
    try {
      await queryInterface.removeColumn('notifications', 'is_read');
    } catch (e) {
      // Column may not exist if fresh database
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove new columns
    await queryInterface.removeColumn('notifications', 'notification_status');
    await queryInterface.removeColumn('notifications', 'application_id');
    await queryInterface.removeColumn('notifications', 'created_by');

    // Re-add isRead column
    await queryInterface.addColumn('notifications', 'is_read', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
  }
};

