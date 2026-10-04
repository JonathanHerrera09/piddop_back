const { sequelize } = require('../src/models');

const sql = `SELECT u.id, u.email, u.name, u.last_name, pr.name AS platform_role,
  cu.company_id, cu.role AS membership_role, GROUP_CONCAT(DISTINCT cr.name) AS company_roles,
  GROUP_CONCAT(DISTINCT CONCAT(p.code, ':', rp.view_permission, '/', rp.create_permission, '/', rp.update_permission, '/', rp.delete_permission, '/', rp.execute_permission)) AS permissions
  FROM users u LEFT JOIN roles pr ON pr.id = u.role_id
  LEFT JOIN company_users cu ON cu.user_id = u.id
  LEFT JOIN company_user_roles cur ON cur.company_user_id = cu.id
  LEFT JOIN roles cr ON cr.id = cur.role_id
  LEFT JOIN role_permissions rp ON rp.role_id = cr.id
  LEFT JOIN permissions p ON p.id = rp.permission_id
  GROUP BY u.id, cu.company_id ORDER BY u.id`;

(async () => { console.table((await sequelize.query(sql))[0]); await sequelize.close(); })().catch((error) => { console.error(error); process.exit(1); });
