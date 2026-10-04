'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('company_settlements', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      settlement_number: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      company_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'companies', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      period_start: { type: Sequelize.DATE, allowNull: false },
      period_end: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.ENUM('issued', 'paid'), allowNull: false, defaultValue: 'issued' },
      currency: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'COP' },
      order_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      gross_sales: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      discounts: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      net_product_sales: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      delivery_fees: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      customer_paid_total: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      platform_commission: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      amount_payable: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      notes: { type: Sequelize.STRING(1000), allowNull: true },
      payout_method: { type: Sequelize.STRING(50), allowNull: true },
      payout_reference: { type: Sequelize.STRING(191), allowNull: true },
      paid_at: { type: Sequelize.DATE, allowNull: true },
      issued_at: { type: Sequelize.DATE, allowNull: false },
      created_by: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      document_hash: { type: Sequelize.STRING(64), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await queryInterface.createTable('company_settlement_items', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      settlement_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'company_settlements', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      order_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, unique: true, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      payment_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'payments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      order_number: { type: Sequelize.STRING(40), allowNull: false },
      payment_provider: { type: Sequelize.STRING(100), allowNull: true },
      payment_reference: { type: Sequelize.STRING(191), allowNull: true },
      paid_at: { type: Sequelize.DATE, allowNull: false },
      subtotal: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      discount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      net_product_sale: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      delivery_fee: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      customer_paid_total: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      commission_amount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      company_payable: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await queryInterface.addIndex('company_settlements', ['company_id', 'period_start', 'period_end'], { name: 'idx_settlements_company_period' });
    await queryInterface.addIndex('company_settlements', ['status', 'created_at'], { name: 'idx_settlements_status_created' });
    await queryInterface.addIndex('company_settlement_items', ['settlement_id'], { name: 'idx_settlement_items_settlement' });
    await queryInterface.addIndex('payments', ['method', 'status', 'paid_at'], { name: 'idx_payments_method_status_paid' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payments', 'idx_payments_method_status_paid');
    await queryInterface.dropTable('company_settlement_items');
    await queryInterface.dropTable('company_settlements');
  }
};
