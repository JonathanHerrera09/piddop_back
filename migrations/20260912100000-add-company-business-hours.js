'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('companies', 'availability_mode', {
      type: Sequelize.ENUM('automatic', 'open', 'closed'),
      allowNull: false,
      defaultValue: 'automatic'
    });
    await queryInterface.addColumn('companies', 'business_hours', {
      type: Sequelize.JSON,
      allowNull: true
    });
    await queryInterface.addColumn('companies', 'timezone', {
      type: Sequelize.STRING(64),
      allowNull: false,
      defaultValue: 'America/Bogota'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('companies', 'timezone');
    await queryInterface.removeColumn('companies', 'business_hours');
    await queryInterface.removeColumn('companies', 'availability_mode');
  }
};
