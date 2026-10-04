'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_legal_acceptances', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false }, document_key: { type: Sequelize.STRING(80), allowNull: false }, document_version: { type: Sequelize.STRING(40), allowNull: false }, accepted_at: { type: Sequelize.DATE, allowNull: false }, source: { type: Sequelize.STRING(40), allowNull: false }, ip_address: Sequelize.STRING(45), user_agent: Sequelize.STRING(500), created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }, updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('user_legal_acceptances', ['user_id', 'document_key', 'document_version'], { name: 'user_legal_acceptances_document_idx' });
  },
  async down(queryInterface) { await queryInterface.dropTable('user_legal_acceptances'); }
};
