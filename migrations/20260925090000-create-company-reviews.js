module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('company_reviews', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      order_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      company_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'companies', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      customer_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      rating: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false },
      comment: { type: Sequelize.STRING(1000), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addConstraint('company_reviews', { fields: ['order_id'], type: 'unique', name: 'uq_company_reviews_order' });
    await queryInterface.addIndex('company_reviews', ['company_id', 'rating'], { name: 'idx_company_reviews_company_rating' });
    await queryInterface.addIndex('company_reviews', ['customer_id'], { name: 'idx_company_reviews_customer' });
  },
  async down(queryInterface) { await queryInterface.dropTable('company_reviews'); }
};
