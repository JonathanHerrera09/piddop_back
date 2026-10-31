require('dotenv').config();
const { sequelize } = require('../src/models');

async function ensureColumn(table, column) {
  const columns = await sequelize.getQueryInterface().describeTable(table);
  if (columns[column]) {
    console.log(`${table}.${column} already exists.`);
    return;
  }
  await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` VARCHAR(500) NULL AFTER \`name\``);
  console.log(`Added ${table}.${column}.`);
}

async function main() {
  try {
    await sequelize.authenticate();
    await ensureColumn('product_ingredients', 'image_url');
    await ensureColumn('variant_options', 'image_url');
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => { console.error('Catalog option image database setup failed:', error.message); process.exitCode = 1; });
