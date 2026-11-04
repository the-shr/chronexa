import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dutyDayFor as serverDutyDay } from '../server/src/lib/duty-day.js';

const require = createRequire(import.meta.url);
const { dutyDayFor: desktopDutyDay, checkInState, punctuality } = require('../desktop/electron/lib/check-ins-core.cjs');
const overnight = { segments: [{ start: '18:00', end: '01:00' }] };
const split = { segments: [{ start: '09:30', end: '11:30' }, { start: '17:00', end: '20:00' }] };

for (const [stamp, work, day] of [
  ['2026-11-03T11:30:00Z', overnight, '2026-11-03'], // early check-in at 17:30
  ['2026-11-03T17:59:59Z', overnight, '2026-11-03'], // 23:59
  ['2026-11-03T18:30:00Z', overnight, '2026-11-03'], // 00:30 next calendar day
  ['2026-11-03T19:00:00Z', overnight, '2026-11-03'], // end of shift at 01:00
  ['2026-11-04T11:30:00Z', overnight, '2026-11-04'], // next duty
  ['2026-11-03T18:30:00Z', split, '2026-11-04'], // no overnight period
]) {
  assert.equal(serverDutyDay(stamp, work), day);
  assert.equal(desktopDutyDay(stamp, work), day);
}

const nightPunch = { checkedInAt: '2026-11-03T11:30:00Z' };
assert.equal(checkInState([nightPunch], overnight, new Date('2026-11-03T18:30:00Z')).covered, true);
assert.equal(punctuality(nightPunch, overnight).label, '30m early');
const late = { checkedInAt: '2026-11-03T18:59:59Z' };
assert.equal(punctuality(late, { segments: [{ start: '23:00', end: '01:00' }] }).label, '2h late');
const next = new Date('2026-11-03T19:00:00Z');
assert.equal(checkInState([nightPunch], overnight, next).covered, false);
assert.equal(checkInState([{checkedInAt: next}], overnight, next).covered, true);
assert.equal(punctuality({checkedInAt: next}, overnight).label, '17h early');
console.log('Duty dates, overnight check-in, and punctuality passed in both JavaScript runtimes.');
