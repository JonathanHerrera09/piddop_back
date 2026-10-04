require('dotenv').config();
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createApp } = require('../src/app');
const { sequelize } = require('../src/models');

const tokenFor = (id) => jwt.sign({ sub: id, type: 'access' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });

(async () => {
  const app = createApp();
  for (const [label, id, companyId] of [['superadmin', 1], ['company-owner', 22, 1]]) {
    const headers = { Authorization: `Bearer ${tokenFor(id)}`, ...(companyId ? { 'X-Company-Id': String(companyId) } : {}) };
    for (const path of companyId ? ['/api/v1/notifications', '/api/v1/company/dashboard', '/api/v1/company/orders', '/api/v1/company/reviews'] : ['/api/v1/notifications', '/api/v1/admin/companies', '/api/v1/admin/reviews']) {
      const response = await request(app).get(path).set(headers);
      console.log(`${label} ${path}: ${response.status} ${response.body.message || ''}`);
    }
  }
  await sequelize.close();
})().catch((error) => { console.error(error); process.exit(1); });
