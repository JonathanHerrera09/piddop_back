const mysql = require('mysql2/promise');
require('dotenv').config();

function parseUserId() {
  const arg = process.argv.find((item) => item.startsWith('--user='));
  if (!arg) {
    return null;
  }

  const value = Number(arg.slice('--user='.length));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function shouldPurge() {
  return process.argv.includes('--purge');
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const userId = parseUserId();
  const purge = shouldPurge();
  const whereClause = userId ? 'WHERE user_id = ?' : '';
  const params = userId ? [userId] : [];

  if (purge) {
    const deleteWhereClause = userId ? 'WHERE user_id = ?' : '';
    const [result] = await connection.query(
      `DELETE FROM push_tokens ${deleteWhereClause}`,
      params
    );

    console.log(
      JSON.stringify(
        {
          mode: 'purge',
          deleted: result.affectedRows || 0,
          filtered_user_id: userId
        },
        null,
        2
      )
    );

    await connection.end();
    return;
  }

  const [rows] = await connection.query(
    `
      SELECT id, user_id, app_scope, platform, token, device_name, updated_at
      FROM push_tokens
      ${whereClause}
      ORDER BY user_id ASC, app_scope ASC, platform ASC, updated_at DESC, id DESC
    `,
    params
  );

  const keepByGroup = new Map();
  const idsToDelete = [];

  for (const row of rows) {
    const groupKey = `${row.user_id}:${row.app_scope}:${row.platform}`;
    if (!keepByGroup.has(groupKey)) {
      keepByGroup.set(groupKey, row);
      continue;
    }

    idsToDelete.push(row.id);
  }

  if (idsToDelete.length) {
    await connection.query(
      `DELETE FROM push_tokens WHERE id IN (${idsToDelete.map(() => '?').join(',')})`,
      idsToDelete
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: 'deduplicate',
        inspected: rows.length,
        kept: keepByGroup.size,
        deleted: idsToDelete.length,
        filtered_user_id: userId
      },
      null,
      2
    )
  );

  await connection.end();
}

main().catch((error) => {
  console.error('Push token cleanup failed:');
  console.error(error);
  process.exit(1);
});
