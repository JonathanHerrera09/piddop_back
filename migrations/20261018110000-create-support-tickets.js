'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('support_tickets', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      customer_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      subject: { type: Sequelize.STRING(180), allowNull: false },
      order_number: Sequelize.STRING(40),
      contact_phone: { type: Sequelize.STRING(30), allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      status: { type: Sequelize.ENUM('open', 'in_progress', 'closed'), allowNull: false, defaultValue: 'open' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('support_tickets', ['status', 'created_at'], { name: 'support_tickets_status_created_idx' });
    await queryInterface.addIndex('support_tickets', ['customer_id'], { name: 'support_tickets_customer_idx' });
  },
  async down(queryInterface) { await queryInterface.dropTable('support_tickets'); }
};
