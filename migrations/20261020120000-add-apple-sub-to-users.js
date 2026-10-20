'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'apple_sub', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.addIndex('users', ['apple_sub'], { name: 'uq_users_apple_sub', unique: true });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('users', 'uq_users_apple_sub');
    await queryInterface.removeColumn('users', 'apple_sub');
  }
};
