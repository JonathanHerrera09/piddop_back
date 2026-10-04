const express = require('express');
const controller = require('../controllers/service.controller');
const { authMiddleware, platformRoleMiddleware } = require('../middlewares/auth.middleware');
const { companyAccessMiddleware, companyPermissionMiddleware } = require('../middlewares/company.middleware');
const { profileUpload, uploadErrorMiddleware } = require('../middlewares/upload.middleware');

const company = express.Router();
company.use(authMiddleware, companyAccessMiddleware);
company.get('/professionals', companyPermissionMiddleware('professionals', 'view'), controller.listProfessionals);
company.post('/professionals', companyPermissionMiddleware('professionals', 'create'), controller.createProfessional);
company.put('/professionals/:id', companyPermissionMiddleware('professionals', 'update'), controller.updateProfessional);
company.post('/professionals/:id/photo', companyPermissionMiddleware('professionals', 'update'), profileUpload.single('image'), uploadErrorMiddleware, controller.replaceProfessionalPhoto);
company.delete('/professionals/:id', companyPermissionMiddleware('professionals', 'delete'), controller.deleteProfessional);
company.get('/services', companyPermissionMiddleware('services', 'view'), controller.listServices);
company.post('/services', companyPermissionMiddleware('services', 'create'), controller.createService);
company.put('/services/:id', companyPermissionMiddleware('services', 'update'), controller.updateService);
company.delete('/services/:id', companyPermissionMiddleware('services', 'delete'), controller.deleteService);
company.get('/professionals/:id/schedules', companyPermissionMiddleware('schedules', 'view'), controller.listSchedules);
company.post('/professionals/:id/schedules', companyPermissionMiddleware('schedules', 'create'), controller.createSchedule);
company.put('/professionals/:id/schedules/:scheduleId', companyPermissionMiddleware('schedules', 'update'), controller.updateSchedule);
company.delete('/professionals/:id/schedules/:scheduleId', companyPermissionMiddleware('schedules', 'delete'), controller.deleteSchedule);
company.get('/appointments', companyPermissionMiddleware('appointments', 'view'), controller.listCompanyAppointments);
company.put('/appointments/:id/status', companyPermissionMiddleware('appointments.status', 'update'), controller.updateCompanyAppointmentStatus);

const publicRouter = express.Router();
publicRouter.get('/:id/availability', controller.availability);

const appointment = express.Router();
appointment.use(authMiddleware, platformRoleMiddleware('CUSTOMER'));
appointment.get('/', controller.listCustomerAppointments);
appointment.post('/', controller.createAppointment);
appointment.get('/:id', controller.getCustomerAppointment);
appointment.post('/:id/cancel', controller.cancelCustomerAppointment);

const professional = express.Router();
professional.use(authMiddleware);
professional.get('/schedules', controller.mySchedules);
professional.post('/schedules', controller.createMySchedule);
professional.put('/schedules/:id', controller.updateMySchedule);
professional.delete('/schedules/:id', controller.deleteMySchedule);
professional.get('/appointments', controller.myAppointments);
professional.put('/appointments/:id/status', controller.updateMyAppointmentStatus);

module.exports = { company, publicRouter, appointment, professional };
