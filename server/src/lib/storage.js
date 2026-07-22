import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Screenshot storage with two drivers.
 *
 *   local — writes under UPLOAD_DIR. Development, or a VPS with a real disk.
 *   r2    — Cloudflare R2 (S3-compatible). Required on serverless, where the
 *           filesystem is ephemeral and anything written during a request
 *           disappears with the instance.
 *
 * R2 objects stay private. Images are only ever served back through
 * /api/image/:id, which requires an admin session and streams the bytes itself,
 * so no storage URL ever reaches the browser and there is no public object to
 * leak. Any other S3-compatible service (AWS, Backblaze, MinIO) works by
 * pointing R2_ENDPOINT at it.
 */

const R2_CONFIGURED = Boolean(
  process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET,
);

export const driver = process.env.STORAGE_DRIVER || (R2_CONFIGURED ? 'r2' : 'local');
export const DRIVERS = ['local', 'r2'];

/**
 * Key prefix inside the bucket. Screenshots and avatars are filed beneath it in
 * their own folders. Use a bucket dedicated to this app with an API token scoped
 * to it: a prefix keeps keys tidy, but a bucket-wide delete script belonging to
 * another app does not care about prefixes, and a shared token means a breach in
 * either app exposes both.
 *
 * Changing this only affects new writes -- reads use the reference stored on the
 * row, so anything already uploaded keeps working.
 */
export function keyPrefix() {
  return (process.env.R2_PREFIX || 'chronexa').replace(/^\/+|\/+$/g, '');
}

/* --------------------------------- local -------------------------------- */

export function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
}

/** Guards against `..` escaping the upload root before any file is touched. */
function resolveLocal(relative) {
  const root = uploadRoot();
  const absolute = path.resolve(root, relative);
  return absolute.startsWith(root + path.sep) ? absolute : null;
}

const localDriver = {
  async put(key, bytes) {
    const absolute = resolveLocal(key);
    if (!absolute) throw new Error('Refusing to write outside the upload root');
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, bytes);
    return key;
  },

  async get(reference) {
    const absolute = resolveLocal(reference);
    if (!absolute) return null;
    try {
      return await fs.readFile(absolute);
    } catch {
      return null;
    }
  },

  async remove(reference) {
    const absolute = resolveLocal(reference);
    if (!absolute) return;
    await fs.unlink(absolute).catch(() => {});
  },
};

/* ---------------------------------- r2 ---------------------------------- */

let s3 = null;
async function s3Client() {
  if (!s3) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3;
}

const r2Driver = {
  async put(key, bytes, contentType = 'image/jpeg') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const fullKey = `${keyPrefix()}/${key}`;
    await (
      await s3Client()
    ).send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fullKey,
        Body: bytes,
        ContentType: contentType,
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
    // The `r2:` scheme records which driver wrote this, so reads keep working
    // even if STORAGE_DRIVER changes later.
    return `r2:${fullKey}`;
  },

  async get(reference) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      const res = await (
        await s3Client()
      ).send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: stripScheme(reference) }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch {
      return null;
    }
  },

  async remove(reference) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      await (
        await s3Client()
      ).send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: stripScheme(reference) }));
    } catch {
      /* non-fatal */
    }
  },
};

function stripScheme(reference) {
  return reference.startsWith('r2:') ? reference.slice(3) : reference;
}

/* -------------------------------- facade -------------------------------- */

function driverFor(reference) {
  // Decide from the stored value, not the current config, so rows written
  // before a driver change keep working.
  return reference.startsWith('r2:') ? r2Driver : localDriver;
}

function activeDriver() {
  if (driver === 'r2') return r2Driver;
  if (driver === 'local') return localDriver;
  throw new Error(`Unknown STORAGE_DRIVER "${driver}". Use one of: ${DRIVERS.join(', ')}.`);
}

/**
 * Stores one object and returns the reference to persist on the row -- a
 * relative path for local, an `r2:`-prefixed object key for R2.
 */
export async function putObject(key, bytes, contentType = 'image/jpeg') {
  return activeDriver().put(key, bytes, contentType);
}

export async function getObject(reference) {
  if (!reference) return null;
  return driverFor(reference).get(reference);
}

export async function removeObject(reference) {
  if (!reference) return;
  return driverFor(reference).remove(reference);
}

/* Screenshots and avatars differ only in the key they are filed under. */
export const putScreenshot = (key, bytes) => putObject(`screenshots/${key}`, bytes, 'image/jpeg');
export const getScreenshot = getObject;
export const removeScreenshot = removeObject;

export const putAvatar = (key, bytes, contentType) => putObject(`avatars/${key}`, bytes, contentType);
export const getAvatar = getObject;
export const removeAvatar = removeObject;
