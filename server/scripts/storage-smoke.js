/**
 * Round-trips a real object through whichever storage driver is configured.
 *
 *   node --env-file=.env scripts/storage-smoke.js
 *
 * Writes to a `_selftest/` key and deletes it again, so it is safe to run
 * against the production bucket.
 */
import { putScreenshot, getScreenshot, removeScreenshot, driver, keyPrefix } from '../src/lib/storage.js';

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** A valid 1x1 JPEG. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAx' +
    'NDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAI' +
    'AQEAAD8AKp//2Q==',
  'base64',
);

console.log(`driver = ${driver}${driver === 'r2' ? ` (bucket ${process.env.R2_BUCKET}, prefix ${keyPrefix()})` : ''}\n`);

const key = `_selftest/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

let reference = null;
try {
  reference = await putScreenshot(key, JPEG);
  check('uploads an object', Boolean(reference), reference);
} catch (err) {
  check('uploads an object', false, err.message);
}

if (reference) {
  if (driver === 'r2') {
    check('records the r2: scheme on the reference', reference.startsWith('r2:'));
    check('namespaces the key under the prefix', reference.includes(keyPrefix()), reference);
  }

  const fetched = await getScreenshot(reference);
  check('reads the object back', Buffer.isBuffer(fetched), fetched ? `${fetched.length} bytes` : 'null');
  check('bytes are identical', fetched && Buffer.compare(fetched, JPEG) === 0);

  await removeScreenshot(reference);
  const afterDelete = await getScreenshot(reference);
  check('deletes the object', afterDelete === null, afterDelete ? 'still readable' : 'gone');
}

// A reference written by the other driver must still route correctly.
check('routes a local reference to the local driver', (await getScreenshot('does/not/exist.jpg')) === null);
check('handles a missing r2 object without throwing', (await getScreenshot('r2:does/not/exist.jpg')) === null);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
