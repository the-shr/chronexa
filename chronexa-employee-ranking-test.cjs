const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = __dirname;
const source = fs.readFileSync(path.join(root, 'server/src/lib/employee-ranking.js'), 'utf8').replace('export function', 'function');
const rankEmployees = vm.runInNewContext(source + '\nrankEmployees');
const rows = [
  { id: 'a', name: 'A', active: true, role: 'employee', weekCompletedActive: 3600 },
  { id: 'b', name: 'B', active: true, role: 'employee', weekCompletedActive: 3600 },
  { id: 'c', name: 'C', active: true, role: 'employee', weekCompletedActive: 1800 },
  { id: 'd', name: 'D', active: false, role: 'employee', weekCompletedActive: 90000 },
  { id: 'e', name: 'E', active: true, role: 'admin', weekCompletedActive: 99000 },
  { id: 'f', name: 'F', active: true, role: 'employee', weekCompletedActive: 0 },
];
assert.deepEqual(Array.from(rankEmployees(rows), (row) => row.weekRank), [1, 1, 3, null, null, null]);
let queried = false;
const code = fs.readFileSync(path.join(root, 'server/src/app/api/agent/admin/employees/route.js'), 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
const GET = vm.runInNewContext(code + '\nGET', { Response, adminDeviceFromRequest: async () => null, prisma: { user: { findMany() { queried = true; } } } });
async function main() {
  assert.equal((await GET({})).status, 401); assert.equal(queried, false, 'Unauthorized access must not query rankings');
  const calls = [];
  const Clock = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-11T18:30:00Z'])); } };
  const startOfDay = (offset, from) => { const date = new Date(from.getTime() + 21600000).toISOString().slice(0,10); return new Date(Date.parse(date + 'T00:00:00+06:00') + offset * 86400000); };
  const get = vm.runInNewContext(code + '\nGET', { Date: Clock, Response, rankEmployees, startOfDay, adminDeviceFromRequest: async () => ({}), prisma: { user: { findMany: async () => [{ ...rows[0], email: 'a@example.com', createdAt: new Date(), devices: [] }] }, workSession: { groupBy: async (query) => { calls.push(query); return [{ userId: 'a', _sum: { activeSeconds: 3600, idleSeconds: 200 } }]; } } } });
  const result = await (await get({})).json();
  assert.equal(result.ranking.weekStart, '2026-10-12', 'Week starts Monday in Dhaka even while UTC is Sunday');
  assert.equal(result.users[0].weekRank, 1);
  assert.equal(calls[0].where.endedAt.not, null, 'Ranking excludes open provisional sessions');
  assert.equal(calls[0]._sum.idleSeconds, undefined, 'Idle is not ranked');
  assert.equal(calls[0].where.startedAt.gte.toISOString(), '2026-10-11T18:00:00.000Z');
  console.log('PASS: admin-only ranking, Dhaka week boundaries, completed sessions, ties, zero time and inactive/admin exclusions');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
