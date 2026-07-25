/**
 * Wipes the installation back to empty: every account and everything they
 * produced, every stored screenshot, every recording in Drive, and the rate
 * limit counters. Leaves the schema and migrations alone.
 *
 *   node --env-file=.env scripts/clear-everything.js --yes
 *
 * This is for handing over a clean deployment, not for routine tidying -- use
 * clear-demo-data.js for that. Without --yes it prints the database host and
 * what would go, and exits; --dry-run shows the counts without touching
 * anything. Read the host before you confirm.
 *
 * Storage is emptied before the rows, so nothing is left in a bucket or a Drive
 * folder with no record pointing at it.
 */
import { prisma } from '../src/lib/db.js';
import { driver as storageDriver, keyPrefix } from '../src/lib/storage.js';
import { configured as driveConfigured, folderId, accessToken } from '../src/lib/drive.js';

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const dryRun = args.includes('--dry-run');

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '(unknown)';
  }
}

const dbHost = hostOf(process.env.DATABASE_URL || '');

if (!confirmed && !dryRun) {
  console.log(`
This deletes EVERYTHING in the Chronexa installation:

  database : ${dbHost}
  storage  : ${storageDriver}${storageDriver === 'r2' ? ` bucket "${process.env.R2_BUCKET}"` : ''}
  drive    : ${driveConfigured ? folderId() || '(root)' : 'not configured'}

  - every account, including admins
  - every session, task, screenshot record and recording record
  - every screenshot object in storage
  - every recording file in the Drive folder
  - the organisation policy
  - the rate limit counters

Nothing is recoverable afterwards.

Run again with --yes to proceed, or --dry-run to see the counts first.
`);
  process.exit(1);
}

/* --------------------------------- counts -------------------------------- */

const before = {
  users: await prisma.user.count(),
  devices: await prisma.device.count(),
  sessions: await prisma.workSession.count(),
  tasks: await prisma.task.count(),
  screenshots: await prisma.screenshot.count(),
  recordings: await prisma.recording.count(),
  policy: await prisma.policy.count(),
};

console.log(`Database ${dbHost}:`);
for (const [k, v] of Object.entries(before)) console.log(`  ${k.padEnd(12)} ${v}`);

if (dryRun) {
  console.log('\nDry run. Nothing was deleted.');
  await prisma.$disconnect();
  process.exit(0);
}

/* --------------------------------- drive --------------------------------- */

if (driveConfigured) {
  const token = await accessToken();
  const parent = folderId();

  // Walk the app's folder and delete everything under it. drive.file means this
  // can only ever see what the app created, so nothing else in Drive is at risk.
  async function children(id) {
    const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return (await res.json()).files || [];
  }

  let removed = 0;
  async function purge(id) {
    for (const file of await children(id)) {
      if (file.mimeType === 'application/vnd.google-apps.folder') await purge(file.id);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok || res.status === 404) removed += 1;
    }
  }

  if (parent) {
    await purge(parent);
    console.log(`\nDrive: removed ${removed} file(s) and folder(s) from the recordings folder.`);
  } else {
    console.log('\nDrive: no folder id set, skipped.');
  }
} else {
  console.log('\nDrive: not configured, skipped.');
}

/* -------------------------------- storage -------------------------------- */

if (storageDriver === 'r2') {
  const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const Bucket = process.env.R2_BUCKET;
  const Prefix = keyPrefix() || undefined;
  let removed = 0;
  let token;

  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token }));
    const keys = (page.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length) {
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }));
      removed += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  console.log(`R2: removed ${removed} object(s) from "${Bucket}"${Prefix ? ` under "${Prefix}"` : ''}.`);
} else {
  console.log(`Storage: driver is "${storageDriver}", left alone. Delete ${process.env.UPLOAD_DIR || './uploads'} by hand if you want it gone.`);
}

/* ------------------------------- the rows -------------------------------- */

// Deleting users cascades to devices, sessions, screenshots, recordings and
// tasks. Policy has no owner, so it goes separately.
await prisma.task.deleteMany({});
await prisma.recording.deleteMany({});
await prisma.screenshot.deleteMany({});
await prisma.workSession.deleteMany({});
await prisma.device.deleteMany({});
await prisma.user.deleteMany({});
await prisma.policy.deleteMany({});

/* ------------------------------ rate limits ------------------------------ */

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  const keys = await redis.keys('ratelimit:*');
  if (keys.length) await redis.del(...keys);
  console.log(`Upstash: cleared ${keys.length} rate limit counter(s).`);
}

/* -------------------------------- the end -------------------------------- */

const after = {
  users: await prisma.user.count(),
  devices: await prisma.device.count(),
  sessions: await prisma.workSession.count(),
  tasks: await prisma.task.count(),
  screenshots: await prisma.screenshot.count(),
  recordings: await prisma.recording.count(),
  policy: await prisma.policy.count(),
};

console.log('\nAfter:');
for (const [k, v] of Object.entries(after)) console.log(`  ${k.padEnd(12)} ${v}`);

const leftover = Object.values(after).reduce((a, b) => a + b, 0);
console.log(
  leftover === 0
    ? '\nEmpty. Create the first admin with:  npm run db:seed\n'
    : `\nWarning: ${leftover} row(s) remain.\n`,
);

await prisma.$disconnect();
process.exit(leftover === 0 ? 0 : 1);
