/**
 * Removes seeded demo accounts and any tracked data belonging to them, including
 * the stored screenshot objects.
 *
 *   node --env-file=.env scripts/clear-demo-data.js
 *
 * Deliberately conservative:
 *   - only touches accounts listed in DEMO_EMAILS
 *   - never removes the last active admin, so you cannot lock yourself out
 *   - deletes the image objects before the rows, so nothing is orphaned in
 *     storage with no database record pointing at it
 */
import { prisma } from '../src/lib/db.js';
import { removeScreenshot } from '../src/lib/storage.js';

const DEMO_EMAILS = (process.env.DEMO_EMAILS || 'admin@example.com,employee@example.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const users = await prisma.user.findMany({
  where: { email: { in: DEMO_EMAILS } },
  include: { _count: { select: { sessions: true, screenshots: true, devices: true } } },
});

if (!users.length) {
  console.log('No demo accounts found. Nothing to do.');
  await prisma.$disconnect();
  process.exit(0);
}

const realAdmins = await prisma.user.count({
  where: { role: 'admin', active: true, email: { notIn: DEMO_EMAILS } },
});

const keep = [];
const remove = [];
for (const user of users) {
  // Keeping one demo admin is better than leaving nobody able to sign in.
  if (user.role === 'admin' && realAdmins === 0) keep.push(user);
  else remove.push(user);
}

for (const user of keep) {
  console.log(`KEEP    ${user.email} — no other admin exists yet; delete it from the Employees page once you have one`);
}

for (const user of remove) {
  const shots = await prisma.screenshot.findMany({
    where: { userId: user.id },
    select: { storagePath: true },
  });
  for (const shot of shots) await removeScreenshot(shot.storagePath);

  // Sessions, screenshots and devices cascade with the user.
  await prisma.user.delete({ where: { id: user.id } });
  console.log(
    `DELETE  ${user.email} — ${user._count.sessions} session(s), ${shots.length} screenshot(s), ${user._count.devices} device(s)`,
  );
}

// Anything left over from the smoke tests that is not tied to a demo account.
const strays = await prisma.screenshot.findMany({
  where: { OR: [{ clientId: { startsWith: 'smoke_' } }, { storagePath: { contains: '_selftest/' } }] },
  select: { id: true, storagePath: true },
});
for (const shot of strays) {
  await removeScreenshot(shot.storagePath);
  await prisma.screenshot.delete({ where: { id: shot.id } });
}
if (strays.length) console.log(`DELETE  ${strays.length} stray smoke-test screenshot(s)`);

console.log('\nRemaining:');
console.log('  users      :', await prisma.user.count());
console.log('  devices    :', await prisma.device.count());
console.log('  sessions   :', await prisma.workSession.count());
console.log('  screenshots:', await prisma.screenshot.count());

await prisma.$disconnect();
