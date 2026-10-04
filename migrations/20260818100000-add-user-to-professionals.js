module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('professionals', 'user_id', {
      type: Sequelize.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL'
    });
    await queryInterface.addIndex('professionals', ['user_id'], {
      unique: true,
      name: 'uq_professionals_user'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('professionals', 'uq_professionals_user');
    await queryInterface.removeColumn('professionals', 'user_id');
  }
};
