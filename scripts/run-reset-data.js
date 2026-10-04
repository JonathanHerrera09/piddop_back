'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function timestamp() {
  const now = new Date();
  const part = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}_${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}`;
}

async function insertRows(connection, table, columns, rows) {
  if (!rows.length) return;
  const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES ?`;
  await connection.query(sql, [rows.map((row) => columns.map((column) => row[column]))]);
}

async function main() {
  if (!process.argv.includes('--confirm-reset')) {
    throw new Error('Falta --confirm-reset. No se modifico la base de datos.');
  }

  const database = process.env.DB_NAME || 'allorajd';
  const masterEmail = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!database || !masterEmail) {
    throw new Error('DB_NAME y SUPER_ADMIN_EMAIL deben existir en backend/.env.');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database,
    charset: 'utf8mb4'
  });

  let backupDatabase = null;
  let previousForeignKeyChecks = 1;
  let destructivePhaseStarted = false;

  try {
    const [[selectedDatabase]] = await connection.query('SELECT DATABASE() AS name, @@FOREIGN_KEY_CHECKS AS foreign_key_checks');
    if (selectedDatabase.name !== database) {
      throw new Error(`La conexion selecciono ${selectedDatabase.name}, no ${database}.`);
    }
    previousForeignKeyChecks = Number(selectedDatabase.foreign_key_checks);

    const [masters] = await connection.execute(
      `SELECT user_account.*, user_role.name AS role_name
       FROM users AS user_account
       INNER JOIN roles AS user_role ON user_role.id = user_account.role_id
       WHERE LOWER(user_account.email) = ?
         AND user_role.name = 'SUPER_ADMIN'
         AND user_account.status = 'active'`,
      [masterEmail]
    );
    if (masters.length !== 1) {
      throw new Error('No existe exactamente un usuario activo SUPER_ADMIN con SUPER_ADMIN_EMAIL. No se borro nada.');
    }

    const [roles] = await connection.query('SELECT * FROM roles ORDER BY (name = \'SUPER_ADMIN\') DESC, id');
    const [permissions] = await connection.query('SELECT * FROM permissions ORDER BY id');
    const [rolePermissions] = await connection.query(
      `SELECT role_row.name AS role_name, permission_row.code AS permission_code,
              relation.create_permission, relation.update_permission, relation.delete_permission,
              relation.view_permission, relation.execute_permission,
              relation.created_at, relation.updated_at
       FROM role_permissions AS relation
       INNER JOIN roles AS role_row ON role_row.id = relation.role_id
       INNER JOIN permissions AS permission_row ON permission_row.id = relation.permission_id
       ORDER BY relation.id`
    );
    const [categories] = await connection.query('SELECT * FROM categories ORDER BY id');
    const [tables] = await connection.execute(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [database]
    );
    if (!tables.length) throw new Error('La base seleccionada no contiene tablas.');

    backupDatabase = `${database}_backup_${timestamp()}`.slice(0, 64);
    await connection.query(`CREATE DATABASE ${quoteIdentifier(backupDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    for (const { TABLE_NAME: upperName, table_name: lowerName } of tables) {
      const tableName = upperName || lowerName;
      await connection.query(
        `CREATE TABLE ${quoteIdentifier(backupDatabase)}.${quoteIdentifier(tableName)} LIKE ${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`
      );
      await connection.query(
        `INSERT INTO ${quoteIdentifier(backupDatabase)}.${quoteIdentifier(tableName)} SELECT * FROM ${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`
      );
      const [[sourceCount]] = await connection.query(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`);
      const [[backupCount]] = await connection.query(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(backupDatabase)}.${quoteIdentifier(tableName)}`);
      if (String(sourceCount.total) !== String(backupCount.total)) {
        throw new Error(`La copia de ${tableName} no coincide. No se inicio el borrado.`);
      }
    }

    destructivePhaseStarted = true;
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const { TABLE_NAME: upperName, table_name: lowerName } of tables) {
      const tableName = upperName || lowerName;
      if (tableName === 'SequelizeMeta') continue;
      await connection.query(`TRUNCATE TABLE ${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`);
    }

    await insertRows(connection, 'roles', ['name', 'description', 'scope', 'created_at', 'updated_at'], roles);
    await insertRows(connection, 'permissions', ['code', 'name', 'module', 'description', 'status', 'created_at', 'updated_at'], permissions);

    const [rebuiltRoles] = await connection.query('SELECT id, name FROM roles');
    const [rebuiltPermissions] = await connection.query('SELECT id, code FROM permissions');
    const roleIds = new Map(rebuiltRoles.map((row) => [row.name, row.id]));
    const permissionIds = new Map(rebuiltPermissions.map((row) => [row.code, row.id]));
    await insertRows(connection, 'role_permissions', [
      'role_id', 'permission_id', 'create_permission', 'update_permission', 'delete_permission',
      'view_permission', 'execute_permission', 'created_at', 'updated_at'
    ], rolePermissions.map((row) => ({
      ...row,
      role_id: roleIds.get(row.role_name),
      permission_id: permissionIds.get(row.permission_code)
    })));

    await insertRows(connection, 'categories', ['name', 'icon', 'type', 'status', 'created_at', 'updated_at'], categories);

    const master = masters[0];
    await insertRows(connection, 'users', [
      'role_id', 'name', 'last_name', 'email', 'phone', 'google_sub', 'password',
      'profile_image', 'status', 'created_at', 'updated_at'
    ], [{ ...master, role_id: roleIds.get('SUPER_ADMIN') }]);

    await connection.query(`SET FOREIGN_KEY_CHECKS = ${previousForeignKeyChecks ? 1 : 0}`);

    const [[result]] = await connection.query(
      `SELECT
         (SELECT COUNT(*) FROM categories) AS categories,
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT MIN(id) FROM categories) AS first_category_id,
         (SELECT id FROM users LIMIT 1) AS master_user_id,
         (SELECT role_id FROM users LIMIT 1) AS master_role_id`
    );
    if (Number(result.users) !== 1 || Number(result.master_user_id) !== 1 || Number(result.master_role_id) !== 1) {
      throw new Error('La verificacion final de IDs no produjo el resultado esperado.');
    }

    console.log(JSON.stringify({
      status: 'completed',
      database,
      backupDatabase,
      preservedCategories: Number(result.categories),
      masterUserId: Number(result.master_user_id),
      masterRoleId: Number(result.master_role_id)
    }, null, 2));
  } catch (error) {
    try {
      await connection.query(`SET FOREIGN_KEY_CHECKS = ${previousForeignKeyChecks ? 1 : 0}`);
    } catch (_) {
      // La conexion puede haber terminado; al cerrarse restaura la variable de sesion.
    }
    error.message = `${error.message}${backupDatabase ? ` Copia: ${backupDatabase}.` : ''}${destructivePhaseStarted ? ' El borrado ya habia comenzado; use la copia para recuperar si es necesario.' : ''}`;
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
