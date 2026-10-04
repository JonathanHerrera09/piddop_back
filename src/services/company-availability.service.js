const AppError = require('../utils/app-error');

const DEFAULT_TIME_ZONE = 'America/Bogota';
const AVAILABILITY_MODES = new Set(['automatic', 'open', 'closed']);
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseBusinessHours(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  return null;
}

function normalizeBusinessHours(value) {
  if (!Array.isArray(value)) throw new AppError('business_hours must be an array', 422);

  const seenDays = new Set();
  const normalized = value.map((entry) => {
    const day = Number(entry?.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6 || seenDays.has(day)) {
      throw new AppError('business_hours must contain each day at most once (0 Sunday through 6 Saturday)', 422);
    }
    seenDays.add(day);

    const enabled = Boolean(entry.enabled);
    const startTime = String(entry.start_time || '09:00').slice(0, 5);
    const endTime = String(entry.end_time || '18:00').slice(0, 5);
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || (enabled && startTime === endTime)) {
      throw new AppError('Each enabled business day needs valid and different start_time and end_time values', 422);
    }

    return { day_of_week: day, enabled, start_time: startTime, end_time: endTime };
  });

  return normalized.sort((left, right) => left.day_of_week - right.day_of_week);
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[values.weekday];
  return { day, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

function zonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isFutureAppointmentSlot(date, time, timeZone = DEFAULT_TIME_ZONE, at = new Date()) {
  const slotTime = String(time).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(slotTime)) return false;

  let currentDate;
  let currentTime;
  try {
    currentDate = zonedDateParts(at, timeZone);
    currentTime = zonedParts(at, timeZone).minutes;
  } catch (_error) {
    currentDate = zonedDateParts(at, DEFAULT_TIME_ZONE);
    currentTime = zonedParts(at, DEFAULT_TIME_ZONE).minutes;
  }

  if (date !== currentDate) return date > currentDate;
  return timeToMinutes(slotTime) > currentTime;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function isCompanyOpen(company, at = new Date()) {
  if (!company || company.status !== 'active') return false;
  if (company.availability_mode === 'closed') return false;
  if (company.availability_mode === 'open') return true;

  const schedule = parseBusinessHours(company.business_hours);
  // Existing companies remain available until they save their first schedule.
  if (!schedule?.length) return true;

  let local;
  try {
    local = zonedParts(at, company.timezone || DEFAULT_TIME_ZONE);
  } catch (_error) {
    local = zonedParts(at, DEFAULT_TIME_ZONE);
  }

  const today = schedule.find((entry) => Number(entry.day_of_week) === local.day);
  if (today?.enabled) {
    const start = timeToMinutes(String(today.start_time).slice(0, 5));
    const end = timeToMinutes(String(today.end_time).slice(0, 5));
    if (start < end && local.minutes >= start && local.minutes < end) return true;
    if (start > end && local.minutes >= start) return true;
  }

  const previousDay = (local.day + 6) % 7;
  const previous = schedule.find((entry) => Number(entry.day_of_week) === previousDay);
  if (previous?.enabled) {
    const start = timeToMinutes(String(previous.start_time).slice(0, 5));
    const end = timeToMinutes(String(previous.end_time).slice(0, 5));
    if (start > end && local.minutes < end) return true;
  }

  return false;
}

function availabilityData(company, at = new Date()) {
  const isOpen = isCompanyOpen(company, at);
  return {
    is_open: isOpen,
    availability_mode: company.availability_mode || 'automatic',
    business_hours: parseBusinessHours(company.business_hours),
    timezone: company.timezone || DEFAULT_TIME_ZONE,
    availability_label: isOpen ? 'Abierto' : 'Cerrado'
  };
}

function assertCompanyOpen(company) {
  if (!isCompanyOpen(company)) {
    throw new AppError('La empresa esta cerrada en este momento. No puedes realizar compras fuera de su horario.', 409);
  }
}

module.exports = {
  AVAILABILITY_MODES,
  DEFAULT_TIME_ZONE,
  assertCompanyOpen,
  availabilityData,
  isFutureAppointmentSlot,
  isCompanyOpen,
  normalizeBusinessHours
};
