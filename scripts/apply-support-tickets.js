'use strict';

const { DataTypes, literal } = require('sequelize');
const { sequelize } = require('../src/models');

async function main() {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const exists = tables.some((table) => String(table).toLowerCase() === 'support_tickets');

  if (!exists) {
    await queryInterface.createTable('support_tickets', {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      customer_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      subject: { type: DataTypes.STRING(180), allowNull: false },
      order_number: DataTypes.STRING(40),
      contact_phone: { type: DataTypes.STRING(30), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('open', 'in_progress', 'closed'), allowNull: false, defaultValue: 'open' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });
    console.log('Created support_tickets.');
  } else {
    console.log('support_tickets already exists.');
  }

  const indexes = await queryInterface.showIndex('support_tickets');
  if (!indexes.some((index) => index.name === 'support_tickets_status_created_idx')) {
    await queryInterface.addIndex('support_tickets', ['status', 'created_at'], { name: 'support_tickets_status_created_idx' });
    console.log('Added support_tickets_status_created_idx.');
  }
  if (!indexes.some((index) => index.name === 'support_tickets_customer_idx')) {
    await queryInterface.addIndex('support_tickets', ['customer_id'], { name: 'support_tickets_customer_idx' });
    console.log('Added support_tickets_customer_idx.');
  }

  const messageExists = tables.some((table) => String(table).toLowerCase() === 'support_ticket_messages');
  if (!messageExists) {
    await queryInterface.createTable('support_ticket_messages', {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      support_ticket_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'support_tickets', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      author_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      message: { type: DataTypes.TEXT, allowNull: false },
      is_internal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('support_ticket_messages', ['support_ticket_id', 'created_at'], { name: 'support_ticket_messages_ticket_created_idx' });
    console.log('Created support_ticket_messages.');
  }
}

main()
  .catch((error) => {
    console.error('Support tickets database setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
