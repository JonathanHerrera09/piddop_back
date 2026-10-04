const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config();

const database = process.env.DB_NAME || 'allorajd';

async function run(command, args) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  await connection.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
  await connection.end();

  await run('npx', ['sequelize-cli', 'db:migrate', '--config', 'src/config/database.js']);
  await run('npx', ['sequelize-cli', 'db:seed:all', '--config', 'src/config/database.js']);
}

main().catch((error) => {
  console.log('Database bootstrap failed:', error.message);
  process.exit(1);
});
