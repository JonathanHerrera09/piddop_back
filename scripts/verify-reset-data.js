'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

async function main() {
  const database = process.env.DB_NAME || 'allorajd';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database
  });

  try {
    const [tables] = await connection.execute(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [database]
    );
    const preserved = new Set(['SequelizeMeta', 'categories', 'users', 'roles', 'permissions', 'role_permissions']);
    const operationalTables = [];
    const nonemptyOperationalTables = [];

    for (const row of tables) {
      const tableName = row.TABLE_NAME || row.table_name;
      if (preserved.has(tableName)) continue;
      operationalTables.push(tableName);
      const [[count]] = await connection.query(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(tableName)}`);
      if (Number(count.total) !== 0) {
        nonemptyOperationalTables.push({ table: tableName, count: Number(count.total) });
      }
    }

    const [[preservedCounts]] = await connection.query(
      `SELECT
        (SELECT COUNT(*) FROM categories) AS categories,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT MIN(id) FROM categories) AS first_category_id,
        (SELECT id FROM users LIMIT 1) AS master_user_id,
        (SELECT role_id FROM users LIMIT 1) AS master_role_id`
    );

    console.log(JSON.stringify({
      database,
      checkedOperationalTables: operationalTables.length,
      nonemptyOperationalTables,
      preserved: {
        categories: Number(preservedCounts.categories),
        users: Number(preservedCounts.users),
        firstCategoryId: Number(preservedCounts.first_category_id),
        masterUserId: Number(preservedCounts.master_user_id),
        masterRoleId: Number(preservedCounts.master_role_id)
      }
    }, null, 2));

    if (nonemptyOperationalTables.length) process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
