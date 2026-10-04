const asyncHandler = require('../utils/async-handler');
const { success } = require('../utils/api-response');
const emailTemplateService = require('../services/email-template.service');

const list = asyncHandler(async (_req, res) => success(res, {
  message: 'Plantillas de correo consultadas correctamente.',
  data: { templates: await emailTemplateService.getTemplates(), status: emailTemplateService.mailStatus() }
}));

const update = asyncHandler(async (req, res) => success(res, {
  message: 'Plantilla guardada correctamente.',
  data: { template: await emailTemplateService.saveTemplate(req.params.key, req.body || {}) }
}));

const testSend = asyncHandler(async (req, res) => success(res, {
  message: 'Correo de prueba enviado correctamente.',
  data: { delivery: await emailTemplateService.sendTestEmail(req.params.key, req.body?.email) }
}));

module.exports = { list, update, testSend };
