'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('push_tokens', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false
      },
      token: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      platform: {
        type: Sequelize.ENUM('ios', 'android'),
        allowNull: false
      },
      app_scope: {
        type: Sequelize.ENUM('customer', 'driver'),
        allowNull: false
      },
      device_name: {
        type: Sequelize.STRING(120),
        allowNull: true
      },
      last_seen_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addConstraint('push_tokens', {
      fields: ['user_id', 'token'],
      type: 'unique',
      name: 'uq_push_tokens_user_token'
    });

    await queryInterface.addIndex('push_tokens', ['user_id'], {
      name: 'idx_push_tokens_user_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('push_tokens');
  }
};
