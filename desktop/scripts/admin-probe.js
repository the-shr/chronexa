'use strict';

/**
 * Drives the admin side of the real app -- the main-process modules, not the
 * browser mock. The preview bridge answers every admin call with fixtures, so
 * it passes whether or not the wiring works; this does not.
 *
 *   npx electron scripts/admin-probe.js
 *
 * Needs the server running and an admin account it can sign in as.
 */

const { app } = require('electron');

app.setName('chronexa-desktop');

const SERVER = process.env.CHRONEXA_SERVER || 'http://localhost:3000';
const ADMIN = { email: 'admin@example.com', password: process.env.CHRONEXA_ADMIN_PASSWORD || 'admin12345' };
const EMPLOYEE = { email: 'employee@example.com', password: process.env.CHRONEXA_EMPLOYEE_PASSWORD || 'employee1234' };

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function refuses(name, fn) {
  try {
    await fn();
    check(name, false, 'it went through');
  } catch (err) {
    check(name, true, err.message);
  }
}

app.whenReady().then(async () => {
  const settings = require('../electron/lib/settings');
  const auth = require('../electron/lib/auth');
  const db = require('../electron/lib/db');
  const tasks = require('../electron/lib/tasks');
  const admin = require('../electron/lib/admin');

  settings.init();
  auth.init();
  db.init();
  tasks.init();
  admin.init();
  settings.set({ sync: { enabled: true, serverUrl: SERVER } });

  /* --------------------------- signed out --------------------------- */

  auth.logout();
  check('signed out, the app is not in admin mode', admin.isAdmin() === false);
  await refuses('and admin reads are refused locally', () => admin.overview());

  /* --------------------------- as an employee ----------------------- */

  try {
    await auth.login({ ...EMPLOYEE, deviceName: 'admin-probe-employee' });
    check('an employee can sign in', true);
    check('but is not in admin mode', admin.isAdmin() === false, auth.get().user?.role);
    await refuses('and cannot read the team', () => admin.overview());
  } catch (err) {
    check('an employee can sign in', false, err.message);
  }

  /* ----------------------------- as an admin ------------------------ */

  try {
    await auth.login({ ...ADMIN, deviceName: 'admin-probe-admin' });
  } catch (err) {
    console.log(`\nCould not sign in as ${ADMIN.email}: ${err.message}`);
    console.log('Set CHRONEXA_ADMIN_PASSWORD, or seed the database first.');
    app.exit(1);
    return;
  }

  check('an admin can sign in', true);
  check('the app switches to admin mode', admin.isAdmin() === true, auth.get().user?.role);

  const overview = await admin.overview(7);
  check('the overview loads', Boolean(overview?.team), `${overview?.people?.length} people`);
  check('it carries a headcount', typeof overview.team.headcount === 'number');
  check('and one bar per day', overview.team.daily.length === 7, String(overview.team.daily.length));
  check(
    'every person has a full week',
    overview.people.every((p) => p.daily.length === 7),
  );

  const roster = await admin.employees();
  check('the roster loads', Array.isArray(roster.users), `${roster.users?.length} account(s)`);
  check(
    'it includes this admin',
    roster.users.some((u) => u.email === ADMIN.email),
  );

  const someone = overview.people[0];
  if (someone) {
    const detail = await admin.employee(someone.id);
    check('one employee loads in depth', detail.user?.id === someone.id);
    check('with their session list', Array.isArray(detail.sessions));
    check('and their task list', Array.isArray(detail.tasks));

    /* ------------------------------ tasks --------------------------- */

    const title = `Probe task ${Date.now()}`;
    const { task } = await admin.assignTask({ userId: someone.id, title, priority: 'high', estimateMinutes: 30 });
    check('assigning work from the app', task?.title === title, task?.id);
    check('it is marked as assigned', task?.source === 'assigned');

    const listed = await admin.tasks({ userId: someone.id, status: 'open' });
    check(
      'it shows in the open list',
      listed.tasks.some((t) => t.id === task.id),
      `${listed.tasks.length} open`,
    );

    const closed = await admin.updateTask({ id: task.id, status: 'done' });
    check('closing it from the app', closed.task?.status === 'done');

    const second = overview.people[1];
    if (second) {
      const moved = await admin.updateTask({ id: task.id, moveTo: second.id });
      check('moving it to someone else', moved.task?.userId === second.id, second.name);
    }

    await admin.deleteTask(task.id);
    const after = await admin.tasks({ status: 'all' });
    check('deleting it from the app', !after.tasks.some((t) => t.id === task.id));
  } else {
    console.log('SKIP  per-employee checks (no employees on this server)');
  }

  /* --------------------------- screenshots -------------------------- */

  const wall = await admin.screenshots({ limit: 5 });
  check('the capture list loads', Array.isArray(wall.screenshots), `${wall.screenshots?.length} row(s)`);

  if (wall.screenshots.length) {
    const url = await admin.image(wall.screenshots[0].id);
    check('a capture comes back as a data URL', typeof url === 'string' && url.startsWith('data:image/'));
    const again = await admin.image(wall.screenshots[0].id);
    check('and the second read is cached', again === url);
  } else {
    console.log('SKIP  image fetch (no captures stored yet)');
  }

  /* ------------------------ signing out clears ---------------------- */

  auth.logout();
  check('signing out drops admin mode', admin.isAdmin() === false);
  await refuses('and closes the team off again', () => admin.overview());

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  app.exit(failed ? 1 : 0);
});
