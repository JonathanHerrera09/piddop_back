module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('roles', 'scope', {
      type: Sequelize.ENUM('platform', 'company'),
      allowNull: false,
      defaultValue: 'platform'
    });

    await queryInterface.createTable('permissions', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      module: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: true },
      status: { type: Sequelize.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await queryInterface.createTable('role_permissions', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      role_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE'
      },
      permission_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'permissions', key: 'id' },
        onDelete: 'CASCADE'
      },
      create_permission: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      update_permission: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      delete_permission: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      view_permission: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      execute_permission: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('role_permissions', ['role_id', 'permission_id'], {
      unique: true,
      name: 'uq_role_permissions_role_permission'
    });

    await queryInterface.createTable('company_user_roles', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      company_user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'company_users', key: 'id' },
        onDelete: 'CASCADE'
      },
      role_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE'
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
    await queryInterface.addIndex('company_user_roles', ['company_user_id', 'role_id'], {
      unique: true,
      name: 'uq_company_user_roles_company_user_role'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('company_user_roles');
    await queryInterface.dropTable('role_permissions');
    await queryInterface.dropTable('permissions');
    await queryInterface.removeColumn('roles', 'scope');
  }
};
