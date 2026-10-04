const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { success } = require('../utils/api-response');
const { sequelize, Company } = require('../models');
const walletService = require('../services/company-wallet.service');

const getOwnWallet = asyncHandler(async (req, res) => {
  const summary = await walletService.getWalletSummary(req.companyAccess.company.id);
  return success(res, {
    message: 'Wallet retrieved successfully',
    data: summary
  });
});

const listOwnTransactions = asyncHandler(async (req, res) => {
  const result = await walletService.listWalletTransactions(
    req.companyAccess.company.id,
    req.query
  );

  return success(res, {
    message: 'Wallet transactions retrieved successfully',
    data: { transactions: result.items, pagination: result.pagination }
  });
});

const topupOwnWallet = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('amount must be greater than 0', 422);
  }

  const result = await walletService.topupCompanyWallet({
    companyId: req.companyAccess.company.id,
    amount,
    description: req.body.description,
    metadata: req.body.metadata || null,
    createdBy: req.auth.user.id
  });

  return success(res, {
    statusCode: 201,
    message: 'Wallet topped up successfully',
    data: result
  });
});

const getCompanyWallet = asyncHandler(async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) throw new AppError('Company not found', 404);

  const summary = await walletService.getWalletSummary(company.id);
  return success(res, {
    message: 'Company wallet retrieved successfully',
    data: summary
  });
});

const listCompanyTransactions = asyncHandler(async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) throw new AppError('Company not found', 404);

  const result = await walletService.listWalletTransactions(company.id, req.query);
  return success(res, {
    message: 'Company wallet transactions retrieved successfully',
    data: { transactions: result.items, pagination: result.pagination }
  });
});

const topupCompany = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('amount must be greater than 0', 422);
  }

  const company = await Company.findByPk(req.params.id);
  if (!company) throw new AppError('Company not found', 404);

  const result = await sequelize.transaction((transaction) => walletService.topupCompanyWallet({
    companyId: company.id,
    amount,
    description: req.body.description,
    metadata: req.body.metadata || null,
    createdBy: req.auth.user.id,
    transaction
  }));

  return success(res, {
    statusCode: 201,
    message: 'Company wallet topped up successfully',
    data: result
  });
});

const adjustCompany = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('amount must be greater than 0', 422);
  }

  const company = await Company.findByPk(req.params.id);
  if (!company) throw new AppError('Company not found', 404);

  const result = await sequelize.transaction((transaction) => walletService.adjustCompanyWallet({
    companyId: company.id,
    amount,
    type: req.body.type,
    description: req.body.description,
    metadata: req.body.metadata || null,
    createdBy: req.auth.user.id,
    transaction
  }));

  return success(res, {
    statusCode: 201,
    message: 'Company wallet adjusted successfully',
    data: result
  });
});

module.exports = {
  getOwnWallet,
  listOwnTransactions,
  topupOwnWallet,
  getCompanyWallet,
  listCompanyTransactions,
  topupCompany,
  adjustCompany
};
