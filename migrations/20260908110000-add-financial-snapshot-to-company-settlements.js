'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = [
      ['closure_type', { type: Sequelize.ENUM('weekly', 'monthly', 'custom'), allowNull: false, defaultValue: 'custom' }],
      ['period_orders_count', { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }],
      ['period_total_sales', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }],
      ['period_pse_sales', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }],
      ['period_cash_sales', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }],
      ['period_customer_paid', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }],
      ['period_commissions', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }],
      ['period_topups', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }],
      ['period_wallet_credits', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }],
      ['period_wallet_debits', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }],
      ['opening_wallet_balance', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }],
      ['closing_wallet_balance', { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 }]
    ];
    for (const [name, definition] of columns) await queryInterface.addColumn('company_settlements', name, definition);
    await queryInterface.addIndex('company_settlements', ['company_id', 'closure_type', 'issued_at'], { name: 'idx_settlements_company_closure_type' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('company_settlements', 'idx_settlements_company_closure_type');
    for (const name of ['closing_wallet_balance', 'opening_wallet_balance', 'period_wallet_debits', 'period_wallet_credits', 'period_topups', 'period_commissions', 'period_customer_paid', 'period_cash_sales', 'period_pse_sales', 'period_total_sales', 'period_orders_count', 'closure_type']) {
      await queryInterface.removeColumn('company_settlements', name);
    }
  }
};
