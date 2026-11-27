// Tests for the Reminder logic shared by the Edge Functions: node tools/test_reminders.mjs
// (Node strips the TypeScript types itself.)
import assert from 'node:assert/strict';
import { isDue, isPushEndpoint, isTimeZone, localNow, reminderFor } from '../supabase/functions/_shared/advent.ts';
import { CALENDAR } from '../supabase/functions/_shared/calendar.ts';

const row = (o = {}) => ({ id: 1, endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'k', auth: 'a', at_minute: 18 * 60 + 30, tz: 'America/New_York', done_on: null, last_sent: null, ...o });
let n = 0;
const test = (name, fn) => { fn(); n++; };

test('push endpoints: known hosts only, https only', () => {
  assert.ok(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(isPushEndpoint('https://web.push.apple.com/QH8'));
  assert.ok(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
  assert.ok(!isPushEndpoint('http://fcm.googleapis.com/x'));
  assert.ok(!isPushEndpoint('https://evil.example/push.apple.com'));
  assert.ok(!isPushEndpoint('https://push.apple.com.evil.example/'));
  assert.ok(!isPushEndpoint(42));
});

test('time zones', () => {
  assert.ok(isTimeZone('America/Chicago'));
  assert.ok(!isTimeZone('Mars/Olympus'));
  assert.ok(!isTimeZone(''));
});

test('local time in the device time zone', () => {
  // 23:40 UTC on Dec 1 is 18:40 on Dec 1 in New York
  assert.deepEqual(localNow(new Date('2026-12-01T23:40:00Z'), 'America/New_York'), { date: '2026-12-01', minute: 18 * 60 + 40 });
  // and already Dec 2 in Berlin
  assert.equal(localNow(new Date('2026-12-01T23:40:00Z'), 'Europe/Berlin').date, '2026-12-02');
});

test('due within the hour after its time, once a day', () => {
  assert.ok(!isDue(row(), { date: '2026-12-01', minute: 18 * 60 + 29 }));
  assert.ok(isDue(row(), { date: '2026-12-01', minute: 18 * 60 + 30 }));
  assert.ok(isDue(row(), { date: '2026-12-01', minute: 19 * 60 + 29 }));
  assert.ok(!isDue(row(), { date: '2026-12-01', minute: 19 * 60 + 30 }));
  assert.ok(!isDue(row({ last_sent: '2026-12-01' }), { date: '2026-12-01', minute: 18 * 60 + 35 }));
});

test('names the Theme, Day, Reading and Reflection Question', () => {
  const m = reminderFor(CALENDAR, row(), '2026-12-04');
  assert.equal(m.title, 'Hope · Day 6');
  assert.ok(m.body.startsWith('Romans 8:20–21 — Imagine God’s fully liberated'));
  assert.equal(m.date, '2026-12-04');
  assert.equal(reminderFor(CALENDAR, row(), '2026-12-06').title, 'Peace · Day 8');
  assert.equal(reminderFor(CALENDAR, row(), '2026-12-25').title, 'Merry Christmas · Love');
});

test('nothing outside Advent', () => {
  assert.equal(reminderFor(CALENDAR, row(), '2026-11-28'), null);
  assert.equal(reminderFor(CALENDAR, row(), '2026-12-26'), null);
});

test('skipped when that Day is already Done', () => {
  assert.equal(reminderFor(CALENDAR, row({ done_on: '2026-12-04' }), '2026-12-04'), null);
  assert.ok(reminderFor(CALENDAR, row({ done_on: '2026-12-03' }), '2026-12-04'));
});

test('payload stays well under the push size limit', () => {
  for (const w of CALENDAR.weeks) for (const [date] of w.days) {
    assert.ok(JSON.stringify(reminderFor(CALENDAR, row(), date)).length < 1000);
  }
});

console.log(`✓ ${n} reminder tests passed`);
