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

// Campaigns are delivered to many users at once. Persist the notification first
// so recipients can still see it in their inbox if the operating system delays
// or suppresses the push notification.
async function notifyUsers(userIds, { type, title, message, data = {}, app_scope: appScope = 'customer' }) {
  const uniqueUserIds = [...new Set(userIds.map(Number).filter(Number.isSafeInteger))];
  if (!uniqueUserIds.length) return { notification_count: 0, push: { tickets: [], receipts: [] } };

  const notifications = await Notification.bulkCreate(uniqueUserIds.map((userId) => ({
    user_id: userId,
    type,
    title,
    message,
    data
  })));
  notifications.forEach((notification) => emitToUser(notification.user_id, 'notification:new', notification.toJSON()));

  const push = await sendPushToUsers(uniqueUserIds, {
    body: message,
    data,
    title,
    type
  }, { appScope });

  return { notification_count: notifications.length, push };
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

module.exports = { notifyUser, notifyUsers, notifyCompany, notifyAvailableDrivers, emitCompany };
