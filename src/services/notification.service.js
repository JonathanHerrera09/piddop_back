const { Notification, CompanyUser, DeliveryDriver } = require('../models');
const { emitToUser } = require('../websocket');
const { sendPushToUsers } = require('./push.service');

async function notifyUser(userId, { type, title, message, data = {}, app_scope: appScope = 'customer' }) {
  const notification = await Notification.create({ user_id: userId, type, title, message, data });
  emitToUser(userId, 'notification:new', notification.toJSON());
  await sendPushToUsers([userId], {
    body: message,
    data,
    title,
    type
  }, { appScope });
  return notification;
}

async function notifyCompany(companyId, payload) {
  const members = await CompanyUser.findAll({ where: { company_id: companyId }, attributes: ['user_id'] });
  return Promise.all(members.map((member) => notifyUser(member.user_id, payload)));
}

async function emitCompany(companyId, event, payload) {
  const members = await CompanyUser.findAll({ where: { company_id: companyId }, attributes: ['user_id'] });
  members.forEach((member) => emitToUser(member.user_id, event, payload));
}

async function notifyAvailableDrivers(payload) {
  const drivers = await DeliveryDriver.findAll({ where: { availability_status: 'available' }, attributes: ['user_id'] });
  return Promise.all(drivers.map((driver) => {
    emitToUser(driver.user_id, 'delivery:available', payload.data || {});
    return notifyUser(driver.user_id, { ...payload, app_scope: 'driver' });
  }));
}

module.exports = { notifyUser, notifyCompany, notifyAvailableDrivers, emitCompany };
