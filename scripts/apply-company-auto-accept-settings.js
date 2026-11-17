'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../src/models');

async function addColumnIfMissing(queryInterface, column) {
  const columns = await queryInterface.describeTable('companies');
  if (columns[column]) {
    console.log(`companies.${column} already exists.`);
    return;
  }
  await queryInterface.addColumn('companies', column, {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  });
  console.log(`Added companies.${column}.`);
}

async function main() {
  const queryInterface = sequelize.getQueryInterface();
  await addColumnIfMissing(queryInterface, 'auto_accept_orders');
  await addColumnIfMissing(queryInterface, 'auto_accept_appointments');
}

main()
  .catch((error) => {
    console.error('Automatic acceptance settings setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
