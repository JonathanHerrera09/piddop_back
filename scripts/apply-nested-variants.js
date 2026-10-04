const { sequelize } = require('../src/models');
const migration = require('../migrations/20260914130000-add-nested-variants');

async function main() {
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable('variants');
  if (columns.parent_option_id) {
    console.log('Nested variants schema is already installed.');
    return;
  }

  await migration.up(queryInterface, sequelize.Sequelize);
  console.log('Nested variants schema installed successfully.');
}

main()
  .catch((error) => {
    console.error('Nested variants schema failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
