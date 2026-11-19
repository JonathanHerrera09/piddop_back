const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { success } = require('../utils/api-response');
const { User, Role, AuditLog } = require('../models');
const { notifyUsers } = require('../services/notification.service');

const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 500;

const sendCampaign = asyncHandler(async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!title || title.length > MAX_TITLE_LENGTH || !message || message.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(`El titulo debe tener hasta ${MAX_TITLE_LENGTH} caracteres y el mensaje hasta ${MAX_MESSAGE_LENGTH}.`, 422);
  }

  const customerRole = await Role.findOne({ where: { name: 'CUSTOMER', scope: 'platform' }, attributes: ['id'] });
  if (!customerRole) throw new AppError('Customer role is not configured', 500);

  // For this first version the campaign is intentionally platform-wide: every
  // active customer receives the same message. It prevents accidental use of
  // arbitrary ids supplied from the browser.
  const recipients = await User.findAll({
    where: { role_id: customerRole.id, status: 'active' },
    attributes: ['id'],
    raw: true
  });
  const recipientIds = recipients.map((recipient) => Number(recipient.id));
  if (!recipientIds.length) throw new AppError('No hay clientes activos para recibir la notificacion.', 409);

  const result = await notifyUsers(recipientIds, {
    type: 'PLATFORM_CAMPAIGN',
    title,
    message,
    data: { source: 'super_admin_campaign' },
    app_scope: 'customer'
  });

  await AuditLog.create({
    user_id: req.auth.user.id,
    action: 'notification.campaign_sent',
    entity_type: 'notification_campaign',
    entity_id: null,
    old_values: null,
    new_values: { title, message, recipient_count: result.notification_count },
    ip_address: req.ip,
    user_agent: req.get('user-agent') || null
  });

  return success(res, {
    message: 'Notificacion enviada a los clientes activos.',
    data: { recipients: result.notification_count, push_tickets: result.push.tickets.length }
  });
});

module.exports = { sendCampaign };
