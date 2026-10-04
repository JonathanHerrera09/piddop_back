const express = require('express'); const AppError = require('../utils/app-error'); const controller = require('../controllers/company.controller'); const walletController = require('../controllers/company-wallet.controller'); const { authMiddleware } = require('../middlewares/auth.middleware'); const { companyAccessMiddleware, companyPermissionMiddleware, companyRoleMiddleware } = require('../middlewares/company.middleware'); const { companyLogoUpload, uploadErrorMiddleware } = require('../middlewares/upload.middleware');
const router = express.Router(); router.use(authMiddleware, companyAccessMiddleware);
router.get('/profile', companyPermissionMiddleware('company_settings', 'view'), controller.getOwnCompany);
router.put('/profile', companyPermissionMiddleware('company_settings', 'update'), controller.updateOwnCompany);
router.post('/profile/logo', companyPermissionMiddleware('company_settings', 'update'), companyLogoUpload.single('image'), uploadErrorMiddleware, controller.replaceOwnLogo);
router.get('/wallet', companyRoleMiddleware('owner', 'manager'), walletController.getOwnWallet);
router.get('/wallet/transactions', companyRoleMiddleware('owner', 'manager'), walletController.listOwnTransactions);
// Company members must not mint internal balance. Manual credits belong to the audited Super Admin flow.
router.post('/wallet/topups', (_req, _res, next) => next(new AppError('Wallet topups are restricted to the Super Admin payment/adjustment flow', 403)));
router.get('/team', companyPermissionMiddleware('company_team', 'view'), controller.listTeam);
router.get('/team/roles', companyPermissionMiddleware('company_team', 'view'), controller.listAssignableRoles);
router.post('/team', companyPermissionMiddleware('company_team', 'create'), (req, res, next) => { req.params.id = req.companyAccess.company.id; return controller.addTeamMember(req, res, next); });
router.put('/team/:memberId/roles', companyPermissionMiddleware('company_team', 'update'), controller.updateTeamRoles);
router.delete('/team/:memberId', companyPermissionMiddleware('company_team', 'delete'), controller.removeTeamMember);
module.exports = router;
