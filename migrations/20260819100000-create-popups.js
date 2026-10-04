module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('popups', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      title: { type: Sequelize.STRING(180), allowNull: false },
      message: { type: Sequelize.STRING(500), allowNull: true },
      image_url: { type: Sequelize.STRING(500), allowNull: false },
      link_url: { type: Sequelize.STRING(500), allowNull: true },
      display_order: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 1 },
      starts_at: { type: Sequelize.DATE, allowNull: true },
      ends_at: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'inactive' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('popups', ['status', 'starts_at', 'ends_at'], { name: 'idx_popups_visibility' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('popups');
  }
};
