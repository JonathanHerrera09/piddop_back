const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const demoCompanies = [
    ['Demo Food', 'food'],
    ['Demo Products', 'products'],
    ['Demo Services', 'services']
  ];

  for (const [name, type] of demoCompanies) {
    const [rows] = await connection.query('SELECT id FROM companies WHERE name = ? AND type = ? ORDER BY id ASC', [name, type]);
    for (const duplicate of rows.slice(1)) {
      await connection.query('DELETE FROM companies WHERE id = ?', [duplicate.id]);
    }
  }

  await connection.end();
}

main().catch((error) => {
  console.error('Demo company cleanup failed:', error.message);
  process.exit(1);
});
