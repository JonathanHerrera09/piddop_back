'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('company_wallets', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      company_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        unique: true,
        references: {
          model: 'companies',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      balance: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      currency: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'COP'
      },
      status: {
        type: Sequelize.ENUM('active', 'low_balance', 'insufficient_balance'),
        allowNull: false,
        defaultValue: 'insufficient_balance'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.createTable('wallet_transactions', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      company_wallet_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: {
          model: 'company_wallets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      company_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: {
          model: 'companies',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.ENUM(
          'topup',
          'order_commission',
          'refund',
          'bonus',
          'manual_credit',
          'manual_debit',
          'adjustment'
        ),
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      balance_before: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      balance_after: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
      },
      reference_type: {
        type: Sequelize.STRING(40),
        allowNull: true
      },
      reference_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true
      },
      description: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_by: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addConstraint('wallet_transactions', {
      fields: ['type', 'reference_type', 'reference_id'],
      type: 'unique',
      name: 'uq_wallet_transactions_reference'
    });

    await queryInterface.addIndex('wallet_transactions', ['company_id', 'created_at'], {
      name: 'idx_wallet_transactions_company_created'
    });

    await queryInterface.addIndex('wallet_transactions', ['company_wallet_id'], {
      name: 'idx_wallet_transactions_wallet'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('wallet_transactions', 'idx_wallet_transactions_wallet');
    await queryInterface.removeIndex('wallet_transactions', 'idx_wallet_transactions_company_created');
    await queryInterface.removeConstraint('wallet_transactions', 'uq_wallet_transactions_reference');
    await queryInterface.dropTable('wallet_transactions');
    await queryInterface.dropTable('company_wallets');
  }
};
