'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addConstraint('support_tickets', {
      fields: ['customer_id'],
      type: 'foreign key',
      name: 'fk_support_tickets_customer',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('support_tickets', 'fk_support_tickets_customer');
  }
};
