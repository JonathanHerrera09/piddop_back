const { Op } = require('sequelize');
const { Appointment, Company, Notification } = require('../models');
const { notifyUser } = require('../services/notification.service');

const TIME_ZONE = 'America/Bogota';
const REMINDER_TYPE = 'APPOINTMENT_REMINDER_24H';
const INTERVAL_MS = 15 * 60 * 1000;
let running = false;

function localDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function appointmentAt(appointment) {
  // Colombia does not use daylight-saving time, so its UTC offset is stable.
  return new Date(`${appointment.scheduled_date}T${appointment.start_time}-05:00`);
}

async function runAppointmentReminders(now = new Date()) {
  if (running) return { skipped: true, sent: 0 };
  running = true;
  try {
    // A 30-minute window overlaps between executions. The notification lookup
    // below makes it safe and avoids missing a reminder after a brief delay.
    const windowStart = new Date(now.getTime() + (23 * 60 + 45) * 60 * 1000);
    const windowEnd = new Date(now.getTime() + (24 * 60 + 15) * 60 * 1000);
    const dates = [...new Set([localDate(windowStart), localDate(windowEnd)])];
    const appointments = await Appointment.findAll({
      where: { scheduled_date: { [Op.in]: dates }, status: { [Op.in]: ['pending', 'accepted'] } },
      include: [{ model: Company, as: 'company', attributes: ['name'] }]
    });
    const candidates = appointments.filter((appointment) => {
      const time = appointmentAt(appointment).getTime();
      return time >= windowStart.getTime() && time <= windowEnd.getTime();
    });
    if (!candidates.length) return { skipped: false, sent: 0 };

    const prior = await Notification.findAll({
      where: { type: REMINDER_TYPE, created_at: { [Op.gte]: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
      attributes: ['data']
    });
    const remindedIds = new Set(prior.map((notification) => Number(notification.data?.appointment_id)).filter(Number.isSafeInteger));
    const pending = candidates.filter((appointment) => !remindedIds.has(Number(appointment.id)));

    await Promise.all(pending.map((appointment) => notifyUser(appointment.customer_id, {
      type: REMINDER_TYPE,
      title: 'Recuerda tu cita mañana',
      message: `Tienes una cita en ${appointment.company?.name || 'tu negocio'} mañana a las ${String(appointment.start_time).slice(0, 5)}.`,
      data: { appointment_id: appointment.id, company_id: appointment.company_id, scheduled_date: appointment.scheduled_date }
    })));

    return { skipped: false, sent: pending.length };
  } finally {
    running = false;
  }
}

function startAppointmentReminderJob() {
  const execute = () => runAppointmentReminders().catch((error) => {
    console.error('[appointment-reminder] failed:', error.message);
  });
  execute();
  return setInterval(execute, INTERVAL_MS);
}

module.exports = { REMINDER_TYPE, runAppointmentReminders, startAppointmentReminderJob };
