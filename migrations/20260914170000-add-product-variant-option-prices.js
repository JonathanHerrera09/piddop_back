module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_variant_option_prices', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      product_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'products', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      variant_option_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'variant_options', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      additional_price: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addConstraint('product_variant_option_prices', { fields: ['product_id', 'variant_option_id'], type: 'unique', name: 'uq_product_variant_option_price' });
    await queryInterface.addIndex('product_variant_option_prices', ['variant_option_id'], { name: 'idx_product_variant_option_prices_option' });

    const insertForDepth = async (joins, optionAlias) => queryInterface.sequelize.query(`
      INSERT IGNORE INTO product_variant_option_prices
        (product_id, variant_option_id, additional_price, created_at, updated_at)
      SELECT pv.product_id, ${optionAlias}.id, ${optionAlias}.additional_price, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM product_variants pv
      ${joins}
    `);
    await insertForDepth('JOIN variant_options vo0 ON vo0.variant_id = pv.variant_id', 'vo0');
    await insertForDepth('JOIN variant_options vo0 ON vo0.variant_id = pv.variant_id JOIN variants v1 ON v1.parent_option_id = vo0.id JOIN variant_options vo1 ON vo1.variant_id = v1.id', 'vo1');
    await insertForDepth('JOIN variant_options vo0 ON vo0.variant_id = pv.variant_id JOIN variants v1 ON v1.parent_option_id = vo0.id JOIN variant_options vo1 ON vo1.variant_id = v1.id JOIN variants v2 ON v2.parent_option_id = vo1.id JOIN variant_options vo2 ON vo2.variant_id = v2.id', 'vo2');
    await queryInterface.removeColumn('variant_options', 'additional_price');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('variant_options', 'additional_price', { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0, after: 'name' });
    await queryInterface.dropTable('product_variant_option_prices');
  }
};
