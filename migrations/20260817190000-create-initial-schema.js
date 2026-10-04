const fs = require('node:fs');
const path = require('node:path');

const schemaPath = path.join(__dirname, '..', 'database', 'initial-schema.sql');

module.exports = {
  async up(queryInterface) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = schema
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await queryInterface.sequelize.query(statement);
    }
  },

  async down(queryInterface) {
    const tables = [
      'audit_logs', 'notifications', 'point_transactions', 'customer_points', 'payments',
      'coupon_usages', 'appointments', 'deliveries', 'delivery_drivers', 'order_status_history',
      'order_item_variants', 'order_items', 'orders', 'cart_item_variants', 'cart_items', 'carts',
      'coupons',
      'customer_addresses', 'professional_schedules', 'service_professionals', 'services',
      'professionals', 'product_variants', 'variant_options', 'variants', 'product_images',
      'products', 'categories', 'company_users', 'companies', 'password_reset_tokens',
      'auth_refresh_tokens', 'users', 'roles'
    ];
    for (const table of tables) await queryInterface.dropTable(table);
  }
};
