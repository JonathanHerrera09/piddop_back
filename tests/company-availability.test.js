const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isFutureAppointmentSlot,
  isCompanyOpen,
  normalizeBusinessHours
} = require('../src/services/company-availability.service');

const mondaySchedule = [
  { day_of_week: 1, enabled: true, start_time: '08:00', end_time: '18:00' }
];

test('company availability follows the Bogota local schedule', () => {
  const company = { status: 'active', availability_mode: 'automatic', business_hours: mondaySchedule, timezone: 'America/Bogota' };

  assert.equal(isCompanyOpen(company, new Date('2026-09-14T15:00:00Z')), true);
  assert.equal(isCompanyOpen(company, new Date('2026-09-14T23:30:00Z')), false);
});

test('manual availability mode overrides the configured schedule', () => {
  const closed = { status: 'active', availability_mode: 'closed', business_hours: mondaySchedule };
  const open = { status: 'active', availability_mode: 'open', business_hours: [] };

  assert.equal(isCompanyOpen(closed, new Date('2026-09-14T15:00:00Z')), false);
  assert.equal(isCompanyOpen(open, new Date('2026-09-14T23:30:00Z')), true);
});

test('overnight schedules remain open after midnight', () => {
  const company = {
    status: 'active',
    availability_mode: 'automatic',
    timezone: 'America/Bogota',
    business_hours: [{ day_of_week: 1, enabled: true, start_time: '20:00', end_time: '02:00' }]
  };

  assert.equal(isCompanyOpen(company, new Date('2026-09-15T06:00:00Z')), true);
  assert.equal(isCompanyOpen(company, new Date('2026-09-15T08:00:00Z')), false);
});

test('business hours validation rejects duplicate days and equal opening times', () => {
  assert.throws(() => normalizeBusinessHours([
    { day_of_week: 1, enabled: true, start_time: '08:00', end_time: '18:00' },
    { day_of_week: 1, enabled: false, start_time: '08:00', end_time: '18:00' }
  ]));
  assert.throws(() => normalizeBusinessHours([
    { day_of_week: 1, enabled: true, start_time: '08:00', end_time: '08:00' }
  ]));
});

test('appointment availability excludes elapsed slots using Bogota time', () => {
  const at = new Date('2026-10-03T02:27:00Z'); // 9:27 p.m. in Bogota on Oct. 2

  assert.equal(isFutureAppointmentSlot('2026-10-02', '09:00', 'America/Bogota', at), false);
  assert.equal(isFutureAppointmentSlot('2026-10-02', '21:00', 'America/Bogota', at), false);
  assert.equal(isFutureAppointmentSlot('2026-10-02', '21:30', 'America/Bogota', at), true);
  assert.equal(isFutureAppointmentSlot('2026-10-03', '09:00', 'America/Bogota', at), true);
});
