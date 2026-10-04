const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;
    if (!email || !password) throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be defined in .env');

    const [roles] = await sequelize.query("SELECT id FROM roles WHERE name = 'SUPER_ADMIN' AND scope = 'platform' LIMIT 1");
    if (!roles.length) throw new Error('SUPER_ADMIN role is not configured');
    const [users] = await sequelize.query('SELECT id FROM users WHERE email = ? LIMIT 1', { replacements: [email.toLowerCase()] });
    if (users.length) return;

    await sequelize.query(`
      INSERT INTO users (role_id, name, last_name, email, phone, password, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `, {
      replacements: [
        roles[0].id,
        process.env.SUPER_ADMIN_NAME || 'Platform',
        process.env.SUPER_ADMIN_LAST_NAME || 'Admin',
        email.toLowerCase(),
        process.env.SUPER_ADMIN_PHONE || '3000000000',
        await bcrypt.hash(password, 12)
      ]
    });
  },
  async down(queryInterface) {
    if (process.env.SUPER_ADMIN_EMAIL) {
      await queryInterface.sequelize.query('DELETE FROM users WHERE email = ?', { replacements: [process.env.SUPER_ADMIN_EMAIL.toLowerCase()] });
    }
  }
};
