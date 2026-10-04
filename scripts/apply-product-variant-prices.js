const { sequelize } = require('../src/models');
const migration = require('../migrations/20260914170000-add-product-variant-option-prices');

async function main() {
  const queryInterface = sequelize.getQueryInterface();
  const tables = (await queryInterface.showAllTables()).map(String);
  const optionColumns = await queryInterface.describeTable('variant_options');
  if (tables.includes('product_variant_option_prices') && !optionColumns.additional_price) {
    console.log('Product-specific variant pricing schema is already installed.');
    return;
  }
  if (tables.includes('product_variant_option_prices')) {
    throw new Error('A partial product-specific pricing migration was detected; review the schema before retrying.');
  }
  await migration.up(queryInterface, sequelize.Sequelize);
  console.log('Product-specific variant pricing schema installed successfully.');
}

main().catch((error) => {
  console.error('Product-specific variant pricing schema failed:', error.message);
  process.exitCode = 1;
}).finally(() => sequelize.close());
