module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('variants', 'parent_option_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'variant_options', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      after: 'company_id'
    });
    await queryInterface.addIndex('variants', ['parent_option_id'], {
      name: 'idx_variants_parent_option'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('variants', 'idx_variants_parent_option');
    await queryInterface.removeColumn('variants', 'parent_option_id');
  }
};
