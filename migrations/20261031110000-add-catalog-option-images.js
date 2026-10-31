module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('product_ingredients', 'image_url', { type: Sequelize.STRING(500), allowNull: true, after: 'name' });
    await queryInterface.addColumn('variant_options', 'image_url', { type: Sequelize.STRING(500), allowNull: true, after: 'name' });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('product_ingredients', 'image_url');
    await queryInterface.removeColumn('variant_options', 'image_url');
  }
};
