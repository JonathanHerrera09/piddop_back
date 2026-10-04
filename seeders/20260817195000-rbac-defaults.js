const permissions = [
  ['dashboard', 'Dashboard', 'dashboard'],
  ['orders', 'Orders', 'orders'],
  ['orders.status', 'Order status actions', 'orders'],
  ['products', 'Products', 'catalog'],
  ['variants', 'Variants', 'catalog'],
  ['services', 'Services', 'services'],
  ['professionals', 'Professionals', 'services'],
  ['schedules', 'Professional schedules', 'services'],
  ['appointments', 'Appointments', 'services'],
  ['appointments.status', 'Appointment status actions', 'services'],
  ['reports', 'Reports', 'reports'],
  ['company_settings', 'Company settings', 'company'],
  ['company_team', 'Company team', 'company']
];

const roleRules = {
  OWNER: permissions.map(([code]) => [code, 1, 1, 1, 1, 1]),
  MANAGER: [
    ['dashboard', 0, 0, 0, 1, 0], ['orders', 0, 1, 0, 1, 1], ['orders.status', 0, 1, 0, 1, 1],
    ['products', 1, 1, 1, 1, 0], ['variants', 1, 1, 1, 1, 0], ['services', 1, 1, 1, 1, 0],
    ['professionals', 1, 1, 1, 1, 0], ['schedules', 1, 1, 1, 1, 0], ['appointments', 1, 1, 1, 1, 1],
    ['appointments.status', 0, 1, 0, 1, 1], ['reports', 0, 0, 0, 1, 0],
    ['company_settings', 0, 1, 0, 1, 0], ['company_team', 1, 1, 1, 1, 0]
  ],
  COOK: [
    ['orders', 0, 0, 0, 1, 0], ['orders.status', 0, 1, 0, 1, 1]
  ],
  PROFESSIONAL: [
    ['professionals', 0, 1, 0, 1, 0], ['schedules', 0, 1, 0, 1, 0],
    ['appointments', 0, 1, 0, 1, 0], ['appointments.status', 0, 1, 0, 1, 1]
  ],
  CATALOG_MANAGER: [
    ['products', 1, 1, 1, 1, 0], ['variants', 1, 1, 1, 1, 0]
  ],
  SUPPORT: [
    ['orders', 0, 0, 0, 1, 0], ['appointments', 0, 0, 0, 1, 0]
  ]
};

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`
      INSERT IGNORE INTO roles (name, description, scope) VALUES
      ('OWNER', 'Company owner', 'company'),
      ('MANAGER', 'Company manager', 'company'),
      ('COOK', 'Kitchen staff', 'company'),
      ('PROFESSIONAL', 'Service professional', 'company'),
      ('CATALOG_MANAGER', 'Catalog manager', 'company'),
      ('SUPPORT', 'Company support staff', 'company')
    `);

    for (const [code, name, module] of permissions) {
      await sequelize.query(
        'INSERT IGNORE INTO permissions (code, name, module, status) VALUES (?, ?, ?, \'active\')',
        { replacements: [code, name, module] }
      );
    }

    for (const [roleName, rules] of Object.entries(roleRules)) {
      for (const [code, create, update, remove, view, execute] of rules) {
        await sequelize.query(`
          INSERT INTO role_permissions
            (role_id, permission_id, create_permission, update_permission, delete_permission, view_permission, execute_permission)
          SELECT roles.id, permissions.id, ?, ?, ?, ?, ?
          FROM roles JOIN permissions
          WHERE roles.name = ? AND permissions.code = ?
          ON DUPLICATE KEY UPDATE
            create_permission = VALUES(create_permission),
            update_permission = VALUES(update_permission),
            delete_permission = VALUES(delete_permission),
            view_permission = VALUES(view_permission),
            execute_permission = VALUES(execute_permission),
            updated_at = CURRENT_TIMESTAMP
        `, { replacements: [create, update, remove, view, execute, roleName, code] });
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DELETE FROM roles WHERE name IN ('OWNER', 'MANAGER', 'COOK', 'PROFESSIONAL', 'CATALOG_MANAGER', 'SUPPORT')");
    await queryInterface.sequelize.query("DELETE FROM permissions WHERE code IN ('dashboard', 'orders', 'orders.status', 'products', 'variants', 'services', 'professionals', 'schedules', 'appointments', 'appointments.status', 'reports', 'company_settings', 'company_team')");
  }
};
