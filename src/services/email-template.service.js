const nodemailer = require('nodemailer');
const AppError = require('../utils/app-error');
const { PlatformSetting } = require('../models');

const EMAIL_TEMPLATES_KEY = 'email_templates';
const TEMPLATE_KEYS = ['welcome', 'email_verification', 'purchase_thanks'];

const defaults = {
  welcome: {
    key: 'welcome',
    name: 'Bienvenida a Allora',
    description: 'Primer saludo cuando una persona crea su cuenta.',
    subject: '¡Bienvenido a Allora, {{name}}!',
    enabled: false,
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:36px 16px"><table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(26,39,68,.10)"><tr><td style="padding:40px;background:linear-gradient(135deg,#ff6b35,#ff9f1c);color:#fff"><div style="font-size:28px;font-weight:800;letter-spacing:-1px">allora</div><h1 style="font-size:34px;line-height:1.1;margin:42px 0 10px">¡Qué alegría tenerte aquí, {{name}}!</h1><p style="font-size:17px;line-height:1.6;margin:0;opacity:.92">Tu cuenta está lista para descubrir lo mejor cerca de ti.</p></td></tr><tr><td style="padding:36px 40px"><p style="font-size:16px;line-height:1.7;margin:0 0 24px">Explora productos, servicios y experiencias locales desde un solo lugar. Nosotros nos encargamos de que todo sea fácil.</p><a href="{{app_url}}" style="display:inline-block;background:#172033;color:#fff;text-decoration:none;padding:15px 26px;border-radius:12px;font-weight:700">Empezar a explorar</a><p style="color:#778096;font-size:13px;line-height:1.6;margin:34px 0 0">Este mensaje fue enviado por Allora. Si no creaste esta cuenta, puedes ignorarlo.</p></td></tr></table></td></tr></table></body></html>`
  },
  email_verification: {
    key: 'email_verification',
    name: 'Verificación de correo',
    description: 'Código de seis dígitos válido durante 60 segundos.',
    subject: '{{code}} es tu código de verificación',
    enabled: false,
    html: `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Arial,sans-serif;color:#172033"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:36px 16px"><table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(26,39,68,.10)"><tr><td style="height:8px;background:linear-gradient(90deg,#ff6b35,#ffb627)"></td></tr><tr><td style="padding:42px;text-align:center"><div style="display:inline-block;background:#fff0e9;color:#ff6b35;border-radius:999px;padding:9px 15px;font-size:13px;font-weight:700">CORREO SEGURO</div><h1 style="font-size:28px;margin:25px 0 10px">Confirma que eres tú</h1><p style="color:#667085;font-size:16px;line-height:1.6;margin:0">Hola {{name}}, usa este código para validar tu correo:</p><div style="font-size:38px;font-weight:800;letter-spacing:10px;margin:30px 0;padding:20px;background:#f7f8fb;border:1px solid #e7eaf0;border-radius:16px;color:#172033">{{code}}</div><p style="font-size:15px;margin:0"><strong>Expira en {{expires_in}} segundos.</strong></p><p style="color:#8b93a5;font-size:13px;line-height:1.6;margin:30px 0 0">Nunca compartas este código. Allora no te lo pedirá por llamada o chat.</p></td></tr></table></td></tr></table></body></html>`
  },
  purchase_thanks: {
    key: 'purchase_thanks',
    name: 'Gracias por tu compra',
    description: 'Confirmación cálida después de completar una compra.',
    subject: 'Gracias por tu compra, {{name}} 🧡',
    enabled: false,
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:36px 16px"><table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(26,39,68,.10)"><tr><td style="padding:42px;text-align:center;background:#172033;color:#fff"><div style="font-size:42px">✓</div><h1 style="font-size:30px;margin:16px 0 8px">¡Gracias por tu compra!</h1><p style="color:#cbd1dc;font-size:16px;margin:0">Tu pedido {{order_number}} quedó confirmado.</p></td></tr><tr><td style="padding:34px 40px"><p style="font-size:16px;line-height:1.7;margin:0 0 22px">Hola {{name}}, el equipo de <strong>{{company_name}}</strong> ya recibió tu pedido y está trabajando para ti.</p><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff7f2;border-radius:14px"><tr><td style="padding:20px"><span style="color:#7a6570;font-size:13px">TOTAL</span><div style="font-size:25px;font-weight:800;color:#ff6b35;margin-top:5px">{{order_total}}</div></td></tr></table><a href="{{order_url}}" style="display:block;text-align:center;background:#ff6b35;color:#fff;text-decoration:none;padding:15px;margin-top:24px;border-radius:12px;font-weight:700">Ver mi pedido</a><p style="color:#8b93a5;font-size:13px;text-align:center;margin:28px 0 0">Gracias por elegir negocios locales con Allora.</p></td></tr></table></td></tr></table></body></html>`
  }
};

function normalizeTemplate(key, value = {}) {
  const fallback = defaults[key];
  if (!fallback) throw new AppError('Plantilla de correo no encontrada.', 404);
  return {
    ...fallback,
    subject: typeof value.subject === 'string' && value.subject.trim() ? value.subject.trim().slice(0, 191) : fallback.subject,
    html: typeof value.html === 'string' && value.html.trim() ? value.html.trim().slice(0, 100000) : fallback.html,
    enabled: value.enabled === true
  };
}

async function getTemplates() {
  const setting = await PlatformSetting.findOne({ where: { key: EMAIL_TEMPLATES_KEY } });
  const saved = setting?.value_json || {};
  return TEMPLATE_KEYS.map((key) => normalizeTemplate(key, saved[key]));
}

async function saveTemplate(key, value) {
  if (!TEMPLATE_KEYS.includes(key)) throw new AppError('Plantilla de correo no encontrada.', 404);
  const current = await getTemplates();
  const next = Object.fromEntries(current.map((template) => [template.key, template]));
  next[key] = normalizeTemplate(key, value);
  const [setting] = await PlatformSetting.findOrCreate({
    where: { key: EMAIL_TEMPLATES_KEY },
    defaults: { key: EMAIL_TEMPLATES_KEY, value_json: next }
  });
  await setting.update({ value_json: next });
  return next[key];
}

function renderTemplate(template, variables) {
  const replace = (value) => value.replace(/{{\s*([a-z_]+)\s*}}/gi, (_match, key) => String(variables[key] ?? `{{${key}}}`));
  return { subject: replace(template.subject), html: replace(template.html) };
}

function createTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    throw new AppError('El correo aún no está configurado. Agrega SMTP_HOST y SMTP_FROM en el backend.', 503);
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined
  });
}

async function sendTestEmail(key, recipient) {
  const email = String(recipient || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    throw new AppError('Ingresa un correo electrónico válido.', 422);
  }
  const template = (await getTemplates()).find((item) => item.key === key);
  if (!template) throw new AppError('Plantilla de correo no encontrada.', 404);
  const variables = {
    name: 'Cliente de prueba', code: String(Math.floor(100000 + Math.random() * 900000)), expires_in: 60,
    app_url: process.env.CUSTOMER_APP_URL || 'https://allora.app', order_number: '#ALL-1024',
    company_name: 'Negocio de prueba', order_total: '$ 48.900', order_url: process.env.CUSTOMER_APP_URL || 'https://allora.app'
  };
  const rendered = renderTemplate(template, variables);
  const info = await createTransport().sendMail({ from: process.env.SMTP_FROM, to: email, subject: rendered.subject, html: rendered.html });
  return { recipient: email, message_id: info.messageId || null, sent_at: new Date().toISOString() };
}

async function sendTemplate(key, recipient, variables = {}) {
  const email = String(recipient || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    throw new AppError('Ingresa un correo electrónico válido.', 422);
  }
  const template = (await getTemplates()).find((item) => item.key === key);
  if (!template) throw new AppError('Plantilla de correo no encontrada.', 404);
  const rendered = renderTemplate(template, variables);
  const info = await createTransport().sendMail({ from: process.env.SMTP_FROM, to: email, subject: rendered.subject, html: rendered.html });
  return { recipient: email, message_id: info.messageId || null, sent_at: new Date().toISOString() };
}

async function sendWithAttachment({ recipient, subject, html, filename, content }) {
  const email = String(recipient || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) throw new AppError('La empresa no tiene un correo electrónico válido.', 422);
  const info = await createTransport().sendMail({ from: process.env.SMTP_FROM, to: email, subject, html, attachments: [{ filename, content, contentType: 'application/pdf' }] });
  return { recipient: email, message_id: info.messageId || null, sent_at: new Date().toISOString() };
}

function mailStatus() {
  const transportConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const senderConfigured = Boolean(process.env.SMTP_FROM);
  return {
    configured: transportConfigured && senderConfigured,
    transport_configured: transportConfigured,
    sender_configured: senderConfigured,
    automatic_sending_enabled: true,
    verification_code_ttl_seconds: 60
  };
}

module.exports = { getTemplates, saveTemplate, sendTestEmail, sendTemplate, sendWithAttachment, mailStatus, renderTemplate };
