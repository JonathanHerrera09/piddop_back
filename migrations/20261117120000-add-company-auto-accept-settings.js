'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('companies', 'auto_accept_orders', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('companies', 'auto_accept_appointments', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('companies', 'auto_accept_appointments');
    await queryInterface.removeColumn('companies', 'auto_accept_orders');
  }
};
