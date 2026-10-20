'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../src/models');

async function main() {
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable('users');

  if (!columns.apple_sub) {
    await queryInterface.addColumn('users', 'apple_sub', {
      type: DataTypes.STRING(255),
      allowNull: true
    });
    console.log('Added users.apple_sub.');
  } else {
    console.log('users.apple_sub already exists.');
  }

  const indexes = await queryInterface.showIndex('users');
  if (!indexes.some((index) => index.name === 'uq_users_apple_sub')) {
    await queryInterface.addIndex('users', ['apple_sub'], {
      name: 'uq_users_apple_sub',
      unique: true
    });
    console.log('Added uq_users_apple_sub.');
  } else {
    console.log('uq_users_apple_sub already exists.');
  }
}

main()
  .catch((error) => {
    console.error('Apple Sign-In database setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
