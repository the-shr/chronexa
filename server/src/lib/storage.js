import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Screenshot storage with two drivers.
 *
 *   local        — writes under UPLOAD_DIR. Fine for development or a VPS.
 *   vercel-blob  — for serverless, where the filesystem is ephemeral and any
 *                  file written during a request disappears with the instance.
 *
 * Either way images are only ever served back through /api/image/:id, which
 * requires an admin session. Blob URLs are unguessable but technically public,
 * so never hand one to the browser -- the route streams the bytes instead.
 * If that residual risk is unacceptable, add an S3 driver with private objects;
 * the interface below is all it needs to implement.
 */

const AUTO = process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : 'local';
export const driver = process.env.STORAGE_DRIVER || AUTO;

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

/* ------------------------------ vercel blob ------------------------------ */

const blobDriver = {
  async put(key, bytes) {
    const { put } = await import('@vercel/blob');
    // addRandomSuffix keeps the URL unguessable; the returned URL is what we
    // store, so the driver can be swapped without rewriting existing rows.
    const result = await put(key, bytes, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return result.url;
  },

  async get(reference) {
    const res = await fetch(reference);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  },

  async remove(reference) {
    const { del } = await import('@vercel/blob');
    await del(reference, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
  },
};

/* -------------------------------- facade -------------------------------- */

function driverFor(reference) {
  // Decide from the stored value, not the current config, so rows written
  // before a driver change keep working.
  return /^https?:\/\//.test(reference) ? blobDriver : localDriver;
}

function activeDriver() {
  if (driver === 'vercel-blob') return blobDriver;
  if (driver === 'local') return localDriver;
  throw new Error(`Unknown STORAGE_DRIVER "${driver}". Use "local" or "vercel-blob".`);
}

/**
 * Stores one screenshot and returns the reference to persist on the row --
 * a relative path for local, an absolute URL for blob.
 */
export async function putScreenshot(key, bytes) {
  return activeDriver().put(key, bytes);
}

export async function getScreenshot(reference) {
  if (!reference) return null;
  return driverFor(reference).get(reference);
}

export async function removeScreenshot(reference) {
  if (!reference) return;
  return driverFor(reference).remove(reference);
}
