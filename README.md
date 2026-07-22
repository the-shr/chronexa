# TimeTracker

Employee time tracking desktop app with interval screenshots and idle detection,
plus a server and admin dashboard.

| | |
|---|---|
| `desktop/` | Electron + React agent that runs on the employee's machine |
| `server/`  | Next.js API + admin dashboard (Prisma, SQLite by default) |

## What it does

- **Time tracking** — start/pause/stop, per-session notes, daily totals, tray icon.
- **Interval screenshots** — one capture per configurable window, optionally at a
  random moment inside that window so the timing is not predictable. Multi-monitor,
  quality/size limits, and an optional privacy blur.
- **Idle detection** — when there is no mouse or keyboard input for the configured
  threshold, a warning window appears with a countdown. Touching the mouse dismisses
  it and tracking continues; if the countdown runs out the timer stops itself.
  Idle minutes (including the threshold window before idle was confirmed) are moved
  out of the billable total.
- **Offline first** — everything is written to disk locally before upload. When the
  server is unreachable, work stays queued and syncs automatically once it returns.
- **Admin dashboard** — team overview, per-employee sessions, idle stops, and a
  screenshot gallery with activity percentages.
- **Employee management** — create accounts, change roles, reset passwords,
  deactivate people, and revoke device tokens, all from the dashboard.

Screen lock and system sleep are treated as immediate hard idle: the session stops
and is recorded with the reason.

## Configurable settings

Everything below is exposed in the app's Settings tab.

| Group | Setting | Default |
|---|---|---|
| Screenshots | enabled | on |
| | interval | 10 min (1–120) |
| | randomise moment in interval | on |
| | capture all monitors | on |
| | JPEG quality / max width | 60% / 1600px |
| | privacy blur | off |
| | notify on capture | on |
| Idle | enabled | on |
| | idle threshold | 5 min (1–60) |
| | show warning | on |
| | warning countdown | 60 s (10–600) |
| | on countdown end | stop the timer (or keep running) |
| | discard idle time | on |
| | warning sound | on |
| General | launch on login | off |
| | start tracking on launch | off |
| | keep running in tray | on |
| Sync | enabled / server URL / interval | off / localhost:3000 / 60 s |
| | upload screenshot images | on |

## Running it

### Server

Needs a Postgres database — a free [Neon](https://neon.tech) project is the
quickest route, and it is the same database you can point production at.

```bash
cd server
npm install
cp .env.example .env          # fill in DATABASE_URL, DIRECT_URL, SESSION_SECRET
npm run setup                 # creates the tables and seeds accounts
npm run dev                   # http://localhost:3000
```

The server refuses to start if the configuration is wrong — a missing
`SESSION_SECRET`, a leftover SQLite URL, or local file storage on a serverless
platform all fail loudly at boot rather than breaking silently later.

The seed creates `admin@example.com / admin12345` and
`employee@example.com / employee1234`. **Change these before any real use** —
override with `SEED_ADMIN_PASSWORD` / `SEED_EMPLOYEE_PASSWORD`. Re-running the
seed never changes an existing account's password; use the dashboard for that.

Sign in at `/dashboard`, then use **Employees** to add real accounts. Passwords
must be 10+ characters with both letters and numbers.

### Desktop app

```bash
cd desktop
npm install
npm run dev                   # Vite + Electron with hot reload
npm start                     # production renderer build, run locally
npm run dist                  # installer in desktop/release
```

Sign in from the app's **Account** tab with an employee account and enable sync.

## Tests

```bash
cd desktop && npm run test:smoke   # idle state machine + screenshot capture (headless Electron)
cd desktop && npm run test:sync    # full round trip against a running server

cd server && npm test              # all three suites below
cd server && npm run test:api      # agent API contract
cd server && npm run test:admin    # employee management rules + token revocation
cd server && npm run test:hardening # rate limiting, security headers, boot validation
```

`test:smoke` stubs `powerMonitor.getSystemIdleTime`, so "the employee walked away"
is simulated instantly instead of waiting five real minutes. The server suites
need `npm run dev` running; the parts that do not need it degrade to unit checks.

## How idle detection works

Idle is read from `powerMonitor.getSystemIdleTime()`, the OS-wide seconds since
the last mouse or keyboard event. There is **no global input hook and no
keylogging** — the app can tell that input happened, never what was typed. That
also means the agent needs no elevated permissions.

Activity percentage shown next to each screenshot is the share of one-second
samples in that interval where input occurred within the last 60 seconds.

## Where data lives

**Agent** (`%APPDATA%/timetracker-desktop` on Windows,
`~/Library/Application Support` on macOS, `~/.config` on Linux):
`settings.json`, `auth.json`, `sessions.json`, `screenshots.json`,
`outbox.json`, and `screenshots/YYYY-MM-DD/`.

Local storage is JSON with atomic writes, so the agent has zero native
dependencies. The `db.js` interface is deliberately SQLite-shaped if that
becomes necessary at higher volume.

**Server**: Postgres for all records. Screenshot images go through a storage
driver selected by `STORAGE_DRIVER`:

| Driver | Where images go | Use for |
|---|---|---|
| `local` | `UPLOAD_DIR` on disk | development, or a VPS with a real disk |
| `vercel-blob` | Vercel Blob store | Vercel and anything else serverless |

Whichever driver is active, images are only ever served back through
`/api/image/:id`, which requires an admin session. The route streams the bytes
itself, so the underlying storage URL never reaches the browser.

Existing rows keep working after a driver change — the reference stored on each
row determines how it is read back, not the current setting.

## Deploying to Vercel

The server is serverless-ready; the desktop agent is unaffected.

1. **Database** — create a Neon or Vercel Postgres database. Set `DATABASE_URL`
   to the **pooled** connection string and `DIRECT_URL` to the unpooled one.
   Serverless functions exhaust direct Postgres connections quickly.
2. **Storage** — add a Vercel Blob store to the project. Vercel injects
   `BLOB_READ_WRITE_TOKEN`; set `STORAGE_DRIVER=vercel-blob`. Without this the
   app refuses to boot, because local writes would silently disappear.
3. **Rate limiting** — create a free Upstash Redis database and set
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Without Redis each
   serverless instance keeps its own counters, so the real limit is far higher
   than intended.
4. **Other env vars** — `SESSION_SECRET` (32+ random chars) and
   `TRUST_PROXY=true`.
5. **Root directory** — set the Vercel project's root to `server/`.
6. Seed the first admin once, from your machine with the production
   `DATABASE_URL` in the environment: `npm run db:seed`. Then sign in and create
   real accounts from the **Employees** page.

`vercel.json` runs `prisma migrate deploy` during the build, so schema changes
ship with the deployment.

One caveat worth knowing: Vercel Blob URLs are unguessable but technically
public. Nothing hands them to the browser, so the practical exposure is small —
but if that is unacceptable for your employees' screens, add an S3 driver with
private objects to `src/lib/storage.js`. It only needs `put`, `get` and
`remove`.

## API

All agent endpoints authenticate with `Authorization: Bearer <device token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/agent/login` | email + password → long-lived device token |
| POST | `/api/agent/sessions` | upsert a session (idempotent on the agent's uuid) |
| POST | `/api/agent/screenshots` | multipart `meta` (JSON) + `file` (JPEG) |
| GET | `/api/image/:id` | serve a stored screenshot — admin session required |

Session durations are clamped server-side (max 24h) and uploads are checked for
the JPEG magic number, since both arrive from a machine the employee controls.

## Security

Already in place:

- **Password hashing** — scrypt with a per-user salt (`node:crypto`, no native
  build step). Minimum 10 characters with letters and numbers.
- **Rate limiting** — both login paths are limited per IP and per account
  (20 / 8 attempts per 15 minutes). The per-account limit is the meaningful one,
  since `x-forwarded-for` can be forged unless a trusted proxy rewrites it.
- **Token revocation** — deactivating an employee or resetting their password
  deletes every device token they hold, so an already-signed-in agent stops
  working immediately.
- **Last-admin guard** — the final active admin cannot be deactivated or demoted,
  and nobody can remove their own admin access. Locking everyone out would
  require a database edit to undo.
- **Boot-time validation** — the server refuses to start if `SESSION_SECRET` is
  missing, still the example value, or (in production) shorter than 32
  characters. It warns about SQLite in production and about an unset
  `TRUST_PROXY`.
- **Security headers** — CSP with `frame-ancestors 'none'`, `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production, and no
  `X-Powered-By`.
- **Screenshot access** — images are served only through `/api/image/:id` behind
  an admin session, never as static files, and the path is built from ids the
  server controls.

Still your responsibility:

- [ ] Change the seeded passwords (or delete those accounts once real ones exist).
- [ ] Serve over HTTPS — device tokens are bearer credentials.
- [ ] Set `TRUST_PROXY=true` if you run behind nginx / Vercel / Cloudflare.
- [ ] Configure Upstash Redis on any multi-instance or serverless deployment.
- [ ] Set a retention policy. Screenshots accumulate indefinitely today.
- [ ] Tell employees what is captured. The agent shows a capture notification by
      default and keeping that on is the honest default.
