# Deploying Chronexa

The server runs on Vercel. The desktop agent is built separately and installed
on each employee's machine, pointed at the deployed server.

---

## How people get accounts

There is **no self-signup**, deliberately: this is a company's own tool, and
anyone able to register would be able to join the team.

1. **You seed the first admin** — once, with `npm run db:seed` (below).
2. **You add each employee** — People tab → `+` → name, work email, a temporary
   password, Role: Employee.
3. **You give them those two things** yourself.
4. **They install the desktop app and sign in** with that email and password.
5. **They change the password** from Profile, along with their name and picture.

Admins are added the same way, with Role: Admin. Admins are never tracked — no
sessions, screenshots or recordings are collected for them, so you do not need
an employee account for yourself.

When someone leaves, **Deactivate** them in People. That revokes their device
tokens immediately, so their agent can no longer send or read anything. Their
recorded history stays.

---

## Environment variables

Set all of these in the Vercel project (Settings → Environment Variables),
for Production. Values come from your `.env` — this file lists the names only.

### Required

| Name | What it is |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `DIRECT_URL` | Neon **unpooled** string, used for migrations |
| `SESSION_SECRET` | Long random string; signs the admin dashboard cookie |
| `TRUST_PROXY` | **`true`** on Vercel — see the warning below |

> `TRUST_PROXY=false` behind Vercel makes every request look like it came from
> the same IP, so one person tripping the sign-in limit locks out everyone.

### Screenshot storage (Cloudflare R2)

| Name | What it is |
|---|---|
| `STORAGE_DRIVER` | `r2` |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 API token, scoped to this bucket only |
| `R2_SECRET_ACCESS_KEY` | " |
| `R2_BUCKET` | Bucket name |
| `R2_PREFIX` | Key prefix inside the bucket |

### Rate limiting (Upstash Redis)

| Name | What it is |
|---|---|
| `UPSTASH_REDIS_REST_URL` | From the database's REST API tab |
| `UPSTASH_REDIS_REST_TOKEN` | " |

Without these, sign-in attempts are counted per serverless instance, which on
Vercel means the limit never really triggers.

### Screen recording (Google Drive)

| Name | What it is |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client (Desktop app type) |
| `GOOGLE_CLIENT_SECRET` | " |
| `GOOGLE_REFRESH_TOKEN` | From `npm run drive:connect` |
| `GOOGLE_DRIVE_FOLDER_ID` | Printed by the same command |

Recording is off until an admin turns it on in Policy. If these are unset, the
server tells agents not to bother uploading rather than queueing forever.

### Retention and the nightly clean-up

| Name | Suggested | What it is |
|---|---|---|
| `SCREENSHOT_RETENTION_DAYS` | `30` | Older screenshots are deleted |
| `RECORDING_RETENTION_DAYS` | `14` | Older clips are deleted from Drive |
| `CRON_SECRET` | long random string | Vercel sends this to the purge endpoint |

`vercel.json` schedules `/api/cron/purge-screenshots` daily at 03:00. It refuses
to run without `CRON_SECRET`, so set it or the clean-up silently never happens
and Drive fills up.

### Not needed on Vercel

`UPLOAD_DIR` is only used by the `local` storage driver.

---

## Deploying

1. **Push** — the repo is the source; Vercel builds from `server/`.
2. **Set the root directory** to `server` in the Vercel project.
3. **Set every variable above**, then deploy.
   The build runs `prisma generate && prisma migrate deploy && next build`, so
   the schema is applied automatically.
4. **Create the first admin.** With the production `DATABASE_URL` in your shell:

   ```
   SEED_ADMIN_EMAIL="you@yourcompany.com" \
   SEED_ADMIN_NAME="Your Name" \
   SEED_ADMIN_PASSWORD="something long and private" \
   npm run db:seed
   ```

   The seed refuses to create the built-in `admin@example.com` when
   `NODE_ENV=production`, so a known password cannot reach a live deployment.

5. **Sign in** at `https://<your-deployment>/login` and add your team.

---

## Pointing the desktop app at it

An installed build points at the deployment automatically; only a build run
from source uses `http://localhost:3000`. The switch is `app.isPackaged` in
`desktop/electron/lib/settings.js`, and the deployment URL is the
`PRODUCTION_SERVER` constant there — change that one line if the deployment
URL changes (e.g. a custom domain).

`CHRONEXA_SERVER=<url>` overrides both, for pointing an installer at a staging
server without rebuilding.

Build the installer to hand out:

```
cd desktop
npm run dist
```

The Windows installer lands in `desktop/release/` as `Chronexa Setup <version>.exe`.

---

## After deploying, check

- `npm run test:drive` — Drive credentials work and a file round-trips
- `npm run test:upstash` — counters really land in Redis, not process memory
- Sign in, add one employee, sign into the agent as them, confirm time appears
  on the admin Overview

---

## Starting over

`npm run clear:everything -- --dry-run` shows what exists.
`npm run clear:everything -- --yes` empties the database, the R2 bucket, the
Drive folder and the rate limit counters. It prints the database host first —
read it before confirming. There is no undo.
