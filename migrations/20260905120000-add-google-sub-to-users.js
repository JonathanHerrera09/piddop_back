'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'google_sub', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await queryInterface.addIndex('users', ['google_sub'], {
      name: 'uq_users_google_sub',
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('users', 'uq_users_google_sub');
    await queryInterface.removeColumn('users', 'google_sub');
  }
};
