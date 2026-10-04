'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_verification_codes', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      email: { type: Sequelize.STRING(191), allowNull: false },
      code_hash: { type: Sequelize.STRING(64), allowNull: false },
      registration_json: { type: Sequelize.JSON, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      attempts: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      consumed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('email_verification_codes', ['email', 'created_at'], { name: 'idx_email_verification_email_created' });
    await queryInterface.addColumn('users', 'email_verified_at', { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'email_verified_at');
    await queryInterface.dropTable('email_verification_codes');
  }
};
