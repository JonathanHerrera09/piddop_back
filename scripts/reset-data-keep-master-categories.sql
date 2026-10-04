-- Reinicio controlado de datos de Allora (MySQL 8+).
--
-- CONSERVA:
--   1. Todas las categorias, reinsertadas con IDs consecutivos desde 1.
--   2. Un unico usuario maestro SUPER_ADMIN, reinsertado con ID 1.
--   3. Roles, permisos y sus relaciones, porque son configuracion indispensable
--      para autenticar al maestro y crear nuevos usuarios/empresas. Sus IDs se
--      reconstruyen consecutivamente desde 1 y SUPER_ADMIN queda como rol ID 1.
--   4. SequelizeMeta, para no perder el historial de migraciones.
--
-- ELIMINA:
--   Todos los demas datos operativos de todas las tablas del esquema actual.
--   TRUNCATE reinicia en 1 el AUTO_INCREMENT de cada tabla vaciada.
--
-- IMPORTANTE: TRUNCATE hace commit implicito y no admite rollback. Realice antes
-- un mysqldump. Ejecute este archivo conectado exclusivamente a la base correcta.

-- Reemplace este valor antes de ejecutar. El script aborta si queda el marcador.
SET @master_email = LOWER('CAMBIAR_POR_CORREO_DEL_MASTER');

DROP PROCEDURE IF EXISTS reset_allora_data;

DELIMITER $$

CREATE PROCEDURE reset_allora_data()
BEGIN
  DECLARE finished INTEGER DEFAULT 0;
  DECLARE master_count INTEGER DEFAULT 0;
  DECLARE current_table VARCHAR(128);
  DECLARE previous_fk_checks INTEGER DEFAULT 1;

  DECLARE tables_cursor CURSOR FOR
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
      AND table_name <> 'SequelizeMeta'
    ORDER BY table_name;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    SET FOREIGN_KEY_CHECKS = previous_fk_checks;
    RESIGNAL;
  END;

  SET previous_fk_checks = @@FOREIGN_KEY_CHECKS;

  IF DATABASE() IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Seleccione primero la base de datos de Allora con USE nombre_base;';
  END IF;

  IF @master_email IS NULL
     OR TRIM(@master_email) = ''
     OR @master_email = LOWER('CAMBIAR_POR_CORREO_DEL_MASTER') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Debe configurar @master_email antes de ejecutar el reinicio.';
  END IF;

  SELECT COUNT(*) INTO master_count
  FROM users AS user_account
  INNER JOIN roles AS user_role ON user_role.id = user_account.role_id
  WHERE LOWER(user_account.email) = @master_email
    AND user_role.name = 'SUPER_ADMIN'
    AND user_account.status = 'active';

  IF master_count <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No existe exactamente un usuario activo con ese correo y rol SUPER_ADMIN. No se borro nada.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS keep_roles;
  DROP TEMPORARY TABLE IF EXISTS keep_permissions;
  DROP TEMPORARY TABLE IF EXISTS keep_role_permissions;
  DROP TEMPORARY TABLE IF EXISTS keep_categories;
  DROP TEMPORARY TABLE IF EXISTS keep_master;

  CREATE TEMPORARY TABLE keep_roles AS
    SELECT id AS old_id, name, description, scope, created_at, updated_at
    FROM roles;

  CREATE TEMPORARY TABLE keep_permissions AS
    SELECT id AS old_id, code, name, module, description, status, created_at, updated_at
    FROM permissions;

  CREATE TEMPORARY TABLE keep_role_permissions AS
    SELECT
      role_row.name AS role_name,
      permission_row.code AS permission_code,
      relation.create_permission,
      relation.update_permission,
      relation.delete_permission,
      relation.view_permission,
      relation.execute_permission,
      relation.created_at,
      relation.updated_at
    FROM role_permissions AS relation
    INNER JOIN roles AS role_row ON role_row.id = relation.role_id
    INNER JOIN permissions AS permission_row ON permission_row.id = relation.permission_id;

  CREATE TEMPORARY TABLE keep_categories AS
    SELECT id AS old_id, name, icon, type, status, created_at, updated_at
    FROM categories;

  CREATE TEMPORARY TABLE keep_master AS
    SELECT
      user_account.name,
      user_account.last_name,
      user_account.email,
      user_account.phone,
      user_account.google_sub,
      user_account.password,
      user_account.profile_image,
      user_account.status,
      user_account.created_at,
      user_account.updated_at
    FROM users AS user_account
    INNER JOIN roles AS user_role ON user_role.id = user_account.role_id
    WHERE LOWER(user_account.email) = @master_email
      AND user_role.name = 'SUPER_ADMIN'
      AND user_account.status = 'active'
    LIMIT 1;

  SET FOREIGN_KEY_CHECKS = 0;

  OPEN tables_cursor;
  truncate_loop: LOOP
    FETCH tables_cursor INTO current_table;
    IF finished = 1 THEN
      LEAVE truncate_loop;
    END IF;

    SET @truncate_statement = CONCAT(
      'TRUNCATE TABLE `',
      REPLACE(current_table, '`', '``'),
      '`'
    );
    PREPARE truncate_command FROM @truncate_statement;
    EXECUTE truncate_command;
    DEALLOCATE PREPARE truncate_command;
  END LOOP;
  CLOSE tables_cursor;

  -- SUPER_ADMIN se inserta primero para garantizar que su rol sea ID 1.
  INSERT INTO roles (name, description, scope, created_at, updated_at)
  SELECT name, description, scope, created_at, updated_at
  FROM keep_roles
  ORDER BY (name = 'SUPER_ADMIN') DESC, old_id;

  INSERT INTO permissions (code, name, module, description, status, created_at, updated_at)
  SELECT code, name, module, description, status, created_at, updated_at
  FROM keep_permissions
  ORDER BY old_id;

  INSERT INTO role_permissions (
    role_id,
    permission_id,
    create_permission,
    update_permission,
    delete_permission,
    view_permission,
    execute_permission,
    created_at,
    updated_at
  )
  SELECT
    role_row.id,
    permission_row.id,
    saved.create_permission,
    saved.update_permission,
    saved.delete_permission,
    saved.view_permission,
    saved.execute_permission,
    saved.created_at,
    saved.updated_at
  FROM keep_role_permissions AS saved
  INNER JOIN roles AS role_row ON role_row.name = saved.role_name
  INNER JOIN permissions AS permission_row ON permission_row.code = saved.permission_code
  ORDER BY role_row.id, permission_row.id;

  INSERT INTO categories (name, icon, type, status, created_at, updated_at)
  SELECT name, icon, type, status, created_at, updated_at
  FROM keep_categories
  ORDER BY old_id;

  INSERT INTO users (
    role_id,
    name,
    last_name,
    email,
    phone,
    google_sub,
    password,
    profile_image,
    status,
    created_at,
    updated_at
  )
  SELECT
    role_row.id,
    saved.name,
    saved.last_name,
    saved.email,
    saved.phone,
    saved.google_sub,
    saved.password,
    saved.profile_image,
    saved.status,
    saved.created_at,
    saved.updated_at
  FROM keep_master AS saved
  INNER JOIN roles AS role_row ON role_row.name = 'SUPER_ADMIN';

  SET FOREIGN_KEY_CHECKS = previous_fk_checks;

  -- Verificacion final visible para quien ejecuta el archivo.
  SELECT
    DATABASE() AS database_name,
    (SELECT COUNT(*) FROM categories) AS preserved_categories,
    (SELECT COUNT(*) FROM users) AS remaining_users,
    (SELECT MIN(id) FROM categories) AS first_category_id,
    (SELECT id FROM users LIMIT 1) AS master_user_id,
    (SELECT role_id FROM users LIMIT 1) AS master_role_id;
END$$

DELIMITER ;

CALL reset_allora_data();
DROP PROCEDURE IF EXISTS reset_allora_data;
