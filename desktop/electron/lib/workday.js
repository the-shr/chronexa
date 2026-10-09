'use strict';
// Reporting and desktop counters use the same organisation day (Asia/Dhaka).
const OFFSET = 6 * 60 * 60 * 1000;
function dayKey(date = new Date()) { return new Date(new Date(date).getTime() + OFFSET).toISOString().slice(0, 10); }
function dayBounds(date = new Date()) { const start = Date.parse(`${dayKey(date)}T00:00:00+06:00`); return [start, start + 86400000]; }
module.exports = { dayKey, dayBounds };
