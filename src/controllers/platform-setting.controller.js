const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const {
  getGlobalCoverageSetting,
  saveGlobalCoverageSetting,
  getCustomerLinksSetting,
  saveCustomerLinksSetting
} = require('../services/platform-setting.service');

const getCoverage = asyncHandler(async (_req, res) => {
  const coverage = await getGlobalCoverageSetting();
  return success(res, {
    message: 'Global coverage retrieved successfully',
    data: { coverage }
  });
});

const getCustomerLinks = asyncHandler(async (_req, res) => {
  const links = await getCustomerLinksSetting();
  return success(res, { message: 'Customer links retrieved successfully', data: { links } });
});

const updateCustomerLinks = asyncHandler(async (req, res) => {
  const links = await saveCustomerLinksSetting(req.body || {});
  return success(res, { message: 'Customer links updated successfully', data: { links } });
});

const updateCoverage = asyncHandler(async (req, res) => {
  const coverage = await saveGlobalCoverageSetting(req.body || {});
  return success(res, {
    message: 'Global coverage updated successfully',
    data: { coverage }
  });
});

module.exports = {
  getCoverage,
  updateCoverage,
  getCustomerLinks,
  updateCustomerLinks
};
