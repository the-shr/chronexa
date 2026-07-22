import path from 'node:path';

/**
 * Where uploaded screenshots are written. Kept outside the Next build output so
 * a redeploy never wipes captured evidence. Point UPLOAD_DIR at a mounted
 * volume in production, or replace this module with an S3 client.
 */
export function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
}

/** Guards against `..` escaping the upload root before any file is read. */
export function resolveUpload(relative) {
  const root = uploadRoot();
  const absolute = path.resolve(root, relative);
  return absolute.startsWith(root + path.sep) ? absolute : null;
}
