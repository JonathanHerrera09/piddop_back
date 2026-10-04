const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Op } = require("sequelize");
const AppError = require("../utils/app-error");
const asyncHandler = require("../utils/async-handler");
const { success } = require("../utils/api-response");
const {
  sequelize,
  Company,
  CompanyUser,
  Professional,
  Service,
  ProfessionalSchedule,
  Appointment,
  User,
} = require("../models");
const {
  suspendCustomerIfNeeded,
} = require("../services/customer-rules.service");
const {
  isFutureAppointmentSlot,
} = require("../services/company-availability.service");
const { paginate } = require("../utils/pagination");

const appointmentInclude = [
  {
    model: Company,
    as: "company",
    attributes: ["id", "name", "type", "logo", "address", "phone", "latitude", "longitude"],
  },
  { model: Service, as: "service" },
  { model: Professional, as: "professional" },
  {
    model: User,
    as: "customer",
    attributes: ["id", "name", "last_name", "email", "phone"],
  },
];
const clean = (body, fields) =>
  Object.fromEntries(
    Object.entries(body).filter(([key]) => fields.includes(key)),
  );
const ensureServicesCompany = (company) => {
  if (company.type !== "services")
    throw new AppError("Only service companies can use this module", 422);
};
const ownProfessional = async (id, companyId) => {
  const item = await Professional.findOne({
    where: { id, company_id: companyId },
  });
  if (!item) throw new AppError("Professional not found", 404);
  return item;
};
const ownService = async (id, companyId) => {
  const item = await Service.findOne({
    where: { id, company_id: companyId },
    include: [{ model: Professional, as: "professionals" }],
  });
  if (!item) throw new AppError("Service not found", 404);
  return item;
};
const ownSchedule = async (id, professionalId) => {
  const item = await ProfessionalSchedule.findOne({
    where: { id, professional_id: professionalId },
  });
  if (!item) throw new AppError("Schedule not found", 404);
  return item;
};
const validSchedule = (body) =>
  Number.isInteger(body.day_of_week) &&
  body.day_of_week >= 0 &&
  body.day_of_week <= 6 &&
  body.start_time &&
  body.end_time &&
  body.start_time < body.end_time;

async function saveProfessionalPhoto(file, professionalId) {
  if (!file) throw new AppError("A professional photo image is required", 422);
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
    file.mimetype
  ];
  const directory = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "professionals",
  );
  await fs.mkdir(directory, { recursive: true });
  const filename = `${professionalId}-${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(directory, filename), file.buffer);
  return `/uploads/professionals/${filename}`;
}

async function deleteProfessionalPhoto(photoUrl) {
  if (photoUrl?.startsWith("/uploads/professionals/")) {
    await fs.unlink(path.join(__dirname, "..", "..", photoUrl)).catch(() => {});
  }
}

async function validateProfessionalUser(userId, companyId) {
  if (!userId) return null;
  const member = await CompanyUser.findOne({
    where: { user_id: userId, company_id: companyId },
  });
  if (!member)
    throw new AppError("Professional user must belong to this company", 422);
  return userId;
}

const listProfessionals = asyncHandler(async (req, res) => {
  ensureServicesCompany(req.companyAccess.company);
  const where = { company_id: req.companyAccess.company.id };
  if (req.query.status) where.status = req.query.status;
  if (req.query.search)
    where[Op.or] = [
      { name: { [Op.like]: `%${req.query.search}%` } },
      { specialty: { [Op.like]: `%${req.query.search}%` } },
    ];
  const page = await paginate(
    Professional,
    {
      where,
      include: [{ model: ProfessionalSchedule, as: "schedules" }],
      allowedSort: {
        id: "id",
        name: "name",
        status: "status",
        created_at: "created_at",
      },
    },
    req.query,
  );
  return success(res, {
    message: "Professionals retrieved successfully",
    data: { professionals: page.items, pagination: page.pagination },
  });
});
const createProfessional = asyncHandler(async (req, res) => {
  ensureServicesCompany(req.companyAccess.company);
  if (!req.body.name) throw new AppError("Professional name is required", 422);
  const userId = await validateProfessionalUser(
    req.body.user_id,
    req.companyAccess.company.id,
  );
  const professional = await Professional.create({
    company_id: req.companyAccess.company.id,
    user_id: userId,
    ...clean(req.body, [
      "name",
      "specialty",
      "phone",
      "email",
      "photo",
      "description",
      "status",
    ]),
  });
  return success(res, {
    statusCode: 201,
    message: "Professional created successfully",
    data: { professional },
  });
});
const updateProfessional = asyncHandler(async (req, res) => {
  const professional = await ownProfessional(
    req.params.id,
    req.companyAccess.company.id,
  );
  const values = clean(req.body, [
    "name",
    "specialty",
    "phone",
    "email",
    "photo",
    "description",
    "status",
  ]);
  if (Object.hasOwn(req.body, "user_id"))
    values.user_id = await validateProfessionalUser(
      req.body.user_id,
      professional.company_id,
    );
  await professional.update(values);
  return success(res, {
    message: "Professional updated successfully",
    data: { professional },
  });
});
const replaceProfessionalPhoto = asyncHandler(async (req, res) => {
  const professional = await ownProfessional(
    req.params.id,
    req.companyAccess.company.id,
  );
  const previousPhoto = professional.photo;
  const photo = await saveProfessionalPhoto(req.file, professional.id);
  await professional.update({ photo });
  await deleteProfessionalPhoto(previousPhoto);
  return success(res, {
    message: "Professional photo updated successfully",
    data: { professional },
  });
});
const deleteProfessional = asyncHandler(async (req, res) => {
  const professional = await ownProfessional(
    req.params.id,
    req.companyAccess.company.id,
  );
  const count = await Appointment.count({
    where: {
      professional_id: professional.id,
      status: { [Op.notIn]: ["cancelled", "completed"] },
    },
  });
  if (count)
    throw new AppError(
      "Cannot delete a professional with active appointments",
      409,
    );
  await professional.destroy();
  return success(res, {
    message: "Professional deleted successfully",
    data: null,
  });
});

const listServices = asyncHandler(async (req, res) => {
  ensureServicesCompany(req.companyAccess.company);
  const where = { company_id: req.companyAccess.company.id };
  if (req.query.status) where.status = req.query.status;
  if (req.query.search)
    where[Op.or] = [
      { name: { [Op.like]: `%${req.query.search}%` } },
      { description: { [Op.like]: `%${req.query.search}%` } },
    ];
  const page = await paginate(
    Service,
    {
      where,
      include: [{ model: Professional, as: "professionals" }],
      allowedSort: {
        id: "id",
        name: "name",
        price: "price",
        status: "status",
        created_at: "created_at",
      },
    },
    req.query,
  );
  return success(res, {
    message: "Services retrieved successfully",
    data: { services: page.items, pagination: page.pagination },
  });
});
async function assignProfessionals(service, ids) {
  const professionals = await Professional.findAll({
    where: { id: ids, company_id: service.company_id },
  });
  if (professionals.length !== new Set(ids).size)
    throw new AppError("Invalid professionals", 422);
  await service.setProfessionals(professionals);
}
const createService = asyncHandler(async (req, res) => {
  ensureServicesCompany(req.companyAccess.company);
  if (
    !req.body.name ||
    !Number(req.body.duration_minutes) ||
    Number(req.body.price) < 0
  )
    throw new AppError(
      "name, duration_minutes, and valid price are required",
      422,
    );
  const service = await Service.create({
    company_id: req.companyAccess.company.id,
    ...clean(req.body, [
      "name",
      "description",
      "duration_minutes",
      "price",
      "status",
    ]),
  });
  if (Array.isArray(req.body.professional_ids))
    await assignProfessionals(service, req.body.professional_ids);
  return success(res, {
    statusCode: 201,
    message: "Service created successfully",
    data: { service: await ownService(service.id, service.company_id) },
  });
});
const updateService = asyncHandler(async (req, res) => {
  const service = await ownService(req.params.id, req.companyAccess.company.id);
  await service.update(
    clean(req.body, [
      "name",
      "description",
      "duration_minutes",
      "price",
      "status",
    ]),
  );
  if (Array.isArray(req.body.professional_ids))
    await assignProfessionals(service, req.body.professional_ids);
  return success(res, {
    message: "Service updated successfully",
    data: { service: await ownService(service.id, service.company_id) },
  });
});
const deleteService = asyncHandler(async (req, res) => {
  const service = await ownService(req.params.id, req.companyAccess.company.id);
  const count = await Appointment.count({
    where: {
      service_id: service.id,
      status: { [Op.notIn]: ["cancelled", "completed"] },
    },
  });
  if (count)
    throw new AppError("Cannot delete a service with active appointments", 409);
  await service.destroy();
  return success(res, { message: "Service deleted successfully", data: null });
});

const listSchedules = asyncHandler(async (req, res) => {
  const professional = await ownProfessional(
    req.params.id,
    req.companyAccess.company.id,
  );
  const schedules = await ProfessionalSchedule.findAll({
    where: { professional_id: professional.id },
  });
  return success(res, {
    message: "Schedules retrieved successfully",
    data: { schedules },
  });
});
const createSchedule = asyncHandler(async (req, res) => {
  const professional = await ownProfessional(
    req.params.id,
    req.companyAccess.company.id,
  );
  if (!validSchedule(req.body))
    throw new AppError(
      "Valid day_of_week, start_time, and end_time are required",
      422,
    );
  const schedule = await ProfessionalSchedule.create({
    professional_id: professional.id,
    ...clean(req.body, ["day_of_week", "start_time", "end_time", "status"]),
  });
  return success(res, {
    statusCode: 201,
    message: "Schedule created successfully",
    data: { schedule },
  });
});
const updateSchedule = asyncHandler(async (req, res) => {
  const professional = await ownProfessional(
    req.params.id,
    req.companyAccess.company.id,
  );
  const schedule = await ownSchedule(req.params.scheduleId, professional.id);
  const values = clean(req.body, [
    "day_of_week",
    "start_time",
    "end_time",
    "status",
  ]);
  if (
    ["day_of_week", "start_time", "end_time"].some((field) =>
      Object.hasOwn(values, field),
    ) &&
    !validSchedule({ ...schedule.toJSON(), ...values })
  )
    throw new AppError(
      "Valid day_of_week, start_time, and end_time are required",
      422,
    );
  await schedule.update(values);
  return success(res, {
    message: "Schedule updated successfully",
    data: { schedule },
  });
});
const deleteSchedule = asyncHandler(async (req, res) => {
  const professional = await ownProfessional(
    req.params.id,
    req.companyAccess.company.id,
  );
  const schedule = await ownSchedule(req.params.scheduleId, professional.id);
  await schedule.destroy();
  return success(res, { message: "Schedule deleted successfully", data: null });
});

const availability = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || ""))
    throw new AppError("A valid date is required", 422);
  const service = await Service.findOne({
    where: { id: req.params.id, status: "active" },
    include: [
      { model: Professional, as: "professionals", where: { status: "active" } },
    ],
  });
  if (!service) throw new AppError("Service not found", 404);
  const professionals = req.query.professional_id
    ? service.professionals.filter(
        (item) => String(item.id) === String(req.query.professional_id),
      )
    : service.professionals;
  const day = new Date(`${date}T00:00:00`).getDay();
  const availabilityData = [];
  for (const professional of professionals) {
    const schedules = await ProfessionalSchedule.findAll({
      where: {
        professional_id: professional.id,
        day_of_week: day,
        status: "active",
      },
    });
    const appointments = await Appointment.findAll({
      where: {
        professional_id: professional.id,
        scheduled_date: date,
        status: { [Op.notIn]: ["cancelled"] },
      },
    });
    const slots = schedules.flatMap((schedule) => {
      const items = [];
      let cursor = schedule.start_time.slice(0, 5);
      const initialSlot = new Date(`2000-01-01T${cursor}:00`);
      const initialMinutes = initialSlot.getMinutes();
      if (initialMinutes % 30 !== 0) {
        initialSlot.setMinutes(initialMinutes < 30 ? 30 : 60);
        cursor = initialSlot.toTimeString().slice(0, 5);
      }
      while (cursor < schedule.end_time.slice(0, 5)) {
        const end = new Date(`2000-01-01T${cursor}:00`);
        end.setMinutes(end.getMinutes() + service.duration_minutes);
        const endTime = end.toTimeString().slice(0, 5);
        if (endTime > schedule.end_time.slice(0, 5)) break;
        if (
          isFutureAppointmentSlot(date, cursor) &&
          !appointments.some(
            (item) =>
              item.start_time.slice(0, 5) < endTime &&
              item.end_time.slice(0, 5) > cursor,
          )
        )
          items.push({ start_time: cursor, end_time: endTime });
        const nextSlot = new Date(`2000-01-01T${cursor}:00`);
        nextSlot.setMinutes(nextSlot.getMinutes() + 30);
        cursor = nextSlot.toTimeString().slice(0, 5);
      }
      return items;
    });
    availabilityData.push({ professional, slots });
  }
  return success(res, {
    message: "Availability retrieved successfully",
    data: { date, service_id: service.id, availability: availabilityData },
  });
});

const createAppointment = asyncHandler(async (req, res) => {
  const {
    service_id: serviceId,
    professional_id: professionalId,
    scheduled_date: date,
    start_time: startTime,
  } = req.body;
  if (!serviceId || !professionalId || !date || !startTime)
    throw new AppError(
      "service_id, professional_id, scheduled_date, and start_time are required",
      422,
    );
  if (!/^\d{2}:(00|30)$/.test(startTime))
    throw new AppError("Appointments must start on a 30-minute interval", 422);
  if (!isFutureAppointmentSlot(date, startTime))
    throw new AppError("Appointments must be scheduled in the future", 422);
  const appointment = await sequelize.transaction(async (transaction) => {
    const service = await Service.findOne({
      where: { id: serviceId, status: "active" },
      transaction,
    });
    const professional = await Professional.findOne({
      where: {
        id: professionalId,
        company_id: service?.company_id,
        status: "active",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!service || !professional)
      throw new AppError("Invalid service or professional", 422);
    if (!(await service.hasProfessional(professional, { transaction })))
      throw new AppError("Professional does not provide this service", 422);
    const end = new Date(`2000-01-01T${startTime}:00`);
    end.setMinutes(end.getMinutes() + service.duration_minutes);
    const endTime = end.toTimeString().slice(0, 5);
    const day = new Date(`${date}T00:00:00`).getDay();
    const schedule = await ProfessionalSchedule.findOne({
      where: {
        professional_id: professional.id,
        day_of_week: day,
        status: "active",
        start_time: { [Op.lte]: startTime },
        end_time: { [Op.gte]: endTime },
      },
      transaction,
    });
    if (!schedule)
      throw new AppError("Selected time is outside professional schedule", 422);
    const conflict = await Appointment.findOne({
      where: {
        professional_id: professional.id,
        scheduled_date: date,
        status: { [Op.notIn]: ["cancelled"] },
        start_time: { [Op.lt]: endTime },
        end_time: { [Op.gt]: startTime },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (conflict)
      throw new AppError("Selected time is no longer available", 409);
    return Appointment.create(
      {
        appointment_number: `APT-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
        customer_id: req.auth.user.id,
        company_id: service.company_id,
        service_id: service.id,
        professional_id: professional.id,
        scheduled_date: date,
        start_time: startTime,
        end_time: endTime,
        price: service.price,
        status: "pending",
        customer_notes: req.body.customer_notes || null,
      },
      { transaction },
    );
  });
  return success(res, {
    statusCode: 201,
    message: "Appointment created successfully",
    data: { appointment },
  });
});

const listCustomerAppointments = asyncHandler(async (req, res) => {
  const appointments = await Appointment.findAll({
    where: { customer_id: req.auth.user.id },
    include: appointmentInclude,
    order: [
      ["scheduled_date", "DESC"],
      ["start_time", "DESC"],
    ],
  });
  return success(res, {
    message: "Appointments retrieved successfully",
    data: { appointments },
  });
});
const getCustomerAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOne({
    where: { id: req.params.id, customer_id: req.auth.user.id },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  return success(res, {
    message: "Appointment retrieved successfully",
    data: { appointment },
  });
});
const cancelCustomerAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOne({
    where: { id: req.params.id, customer_id: req.auth.user.id },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (!["pending", "accepted"].includes(appointment.status))
    throw new AppError("This appointment cannot be cancelled", 422);
  if (
    new Date(
      `${appointment.scheduled_date}T${appointment.start_time}`,
    ).getTime() -
      Date.now() <
    30 * 60 * 1000
  ) {
    throw new AppError(
      "Appointments can only be cancelled at least 30 minutes in advance",
      422,
    );
  }

  let blocked = false;
  await sequelize.transaction(async (transaction) => {
    await appointment.update({ status: "cancelled" }, { transaction });
    blocked = await suspendCustomerIfNeeded({
      transaction,
      userId: req.auth.user.id,
    });
  });

  return success(res, {
    message: blocked
      ? "Appointment cancelled successfully and account suspended due to excessive monthly cancellations"
      : "Appointment cancelled successfully",
    data: {
      appointment,
      account_status: blocked ? "suspended" : "active",
    },
  });
});

const listCompanyAppointments = asyncHandler(async (req, res) => {
  ensureServicesCompany(req.companyAccess.company);
  const where = { company_id: req.companyAccess.company.id };
  if (req.query.status) where.status = req.query.status;
  if (req.query.search)
    where[Op.or] = [
      { appointment_number: { [Op.like]: `%${req.query.search}%` } },
      { status: { [Op.like]: `%${req.query.search}%` } },
    ];
  const page = await paginate(
    Appointment,
    {
      where,
      include: appointmentInclude,
      allowedSort: {
        id: "id",
        scheduled_date: "scheduled_date",
        status: "status",
        created_at: "created_at",
      },
      order: [
        ["scheduled_date", "ASC"],
        ["start_time", "ASC"],
      ],
    },
    req.query,
  );
  return success(res, {
    message: "Company appointments retrieved successfully",
    data: { appointments: page.items, pagination: page.pagination },
  });
});
async function changeAppointmentStatus(appointment, status) {
  const transitions = { pending: ["accepted"], accepted: ["completed"] };
  if (!transitions[appointment.status]?.includes(status))
    throw new AppError(
      `Cannot change appointment from ${appointment.status} to ${status}`,
      422,
    );
  await appointment.update({ status });
  return appointment;
}
const updateCompanyAppointmentStatus = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOne({
    where: { id: req.params.id, company_id: req.companyAccess.company.id },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  await changeAppointmentStatus(appointment, req.body.status);
  return success(res, {
    message: "Appointment status updated successfully",
    data: { appointment },
  });
});
async function currentProfessional(userId) {
  const professional = await Professional.findOne({
    where: { user_id: userId, status: "active" },
  });
  if (!professional)
    throw new AppError(
      "No active professional profile is linked to this user",
      403,
    );
  return professional;
}
const mySchedules = asyncHandler(async (req, res) => {
  const professional = await currentProfessional(req.auth.user.id);
  const schedules = await ProfessionalSchedule.findAll({
    where: { professional_id: professional.id },
  });
  return success(res, {
    message: "Professional schedules retrieved successfully",
    data: { schedules },
  });
});
const createMySchedule = asyncHandler(async (req, res) => {
  const professional = await currentProfessional(req.auth.user.id);
  if (!validSchedule(req.body))
    throw new AppError(
      "Valid day_of_week, start_time, and end_time are required",
      422,
    );
  const schedule = await ProfessionalSchedule.create({
    professional_id: professional.id,
    ...clean(req.body, ["day_of_week", "start_time", "end_time", "status"]),
  });
  return success(res, {
    statusCode: 201,
    message: "Schedule created successfully",
    data: { schedule },
  });
});
const updateMySchedule = asyncHandler(async (req, res) => {
  const professional = await currentProfessional(req.auth.user.id);
  const schedule = await ownSchedule(req.params.id, professional.id);
  const values = clean(req.body, [
    "day_of_week",
    "start_time",
    "end_time",
    "status",
  ]);
  if (
    ["day_of_week", "start_time", "end_time"].some((field) =>
      Object.hasOwn(values, field),
    ) &&
    !validSchedule({ ...schedule.toJSON(), ...values })
  )
    throw new AppError(
      "Valid day_of_week, start_time, and end_time are required",
      422,
    );
  await schedule.update(values);
  return success(res, {
    message: "Schedule updated successfully",
    data: { schedule },
  });
});
const deleteMySchedule = asyncHandler(async (req, res) => {
  const professional = await currentProfessional(req.auth.user.id);
  const schedule = await ownSchedule(req.params.id, professional.id);
  await schedule.destroy();
  return success(res, { message: "Schedule deleted successfully", data: null });
});
const myAppointments = asyncHandler(async (req, res) => {
  const professional = await currentProfessional(req.auth.user.id);
  const appointments = await Appointment.findAll({
    where: { professional_id: professional.id },
    include: appointmentInclude,
    order: [
      ["scheduled_date", "ASC"],
      ["start_time", "ASC"],
    ],
  });
  return success(res, {
    message: "Professional appointments retrieved successfully",
    data: { appointments },
  });
});
const updateMyAppointmentStatus = asyncHandler(async (req, res) => {
  const professional = await currentProfessional(req.auth.user.id);
  const appointment = await Appointment.findOne({
    where: { id: req.params.id, professional_id: professional.id },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  await changeAppointmentStatus(appointment, req.body.status);
  return success(res, {
    message: "Appointment status updated successfully",
    data: { appointment },
  });
});

module.exports = {
  listProfessionals,
  createProfessional,
  updateProfessional,
  replaceProfessionalPhoto,
  deleteProfessional,
  listServices,
  createService,
  updateService,
  deleteService,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  availability,
  createAppointment,
  listCustomerAppointments,
  getCustomerAppointment,
  cancelCustomerAppointment,
  listCompanyAppointments,
  updateCompanyAppointmentStatus,
  mySchedules,
  createMySchedule,
  updateMySchedule,
  deleteMySchedule,
  myAppointments,
  updateMyAppointmentStatus,
};
