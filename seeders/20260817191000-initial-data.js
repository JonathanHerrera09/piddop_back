module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT IGNORE INTO roles (name, description) VALUES
        ('SUPER_ADMIN', 'Platform administrator'),
        ('CUSTOMER', 'Customer account'),
        ('DELIVERY', 'Delivery driver account'),
        ('COMPANY', 'Company account')
    `);

    for (const [name, type, description] of [
      ['Demo Food', 'food', 'Demo food company'],
      ['Demo Products', 'products', 'Demo products company'],
      ['Demo Services', 'services', 'Demo services company']
    ]) {
      await queryInterface.sequelize.query(`
        INSERT INTO companies (name, type, description, commission_percentage, status)
        SELECT ?, ?, ?, 15.00, 'active'
        WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = ? AND type = ?)
      `, { replacements: [name, type, description, name, type] });
    }
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query("DELETE FROM companies WHERE name IN ('Demo Food', 'Demo Products', 'Demo Services')");
    await queryInterface.sequelize.query("DELETE FROM roles WHERE name IN ('SUPER_ADMIN', 'CUSTOMER', 'DELIVERY', 'COMPANY')");
  }
};
