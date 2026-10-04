const express = require('express');
const controller = require('../controllers/mobile.controller');

const router = express.Router();

router.get('/home', controller.home);
router.get('/coverage', controller.coverage);
router.get('/companies', controller.listCompanies);
router.get('/companies/:id', controller.companyDetail);
router.get('/search', controller.search);

module.exports = router;
