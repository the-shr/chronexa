/**
 * Creates a migration from the schema files alone.
 *
 *   node scripts/new-migration.js add_something
 *
 * Never use `prisma migrate diff --from-migrations --shadow-database-url <your
 * database>`: Prisma *resets* whatever it is given as the shadow database, so
 * pointing that at the real one drops every row in it. Diffing the committed
 * schema against the working one needs no database at all, which is why this
 * script exists.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage: node scripts/new-migration.js <lower_snake_case_name>');
  process.exit(1);
}

const schema = path.join('prisma', 'schema.prisma');
const previous = path.join(os.tmpdir(), `chronexa-schema-${Date.now()}.prisma`);

// The last committed schema is the state the database is already in.
try {
  fs.writeFileSync(previous, execFileSync('git', ['show', `HEAD:server/${schema.replace(/\\/g, '/')}`], { encoding: 'utf8' }));
} catch {
  console.error('Could not read the committed schema. Commit your schema changes separately, or run this from a clean tree.');
  process.exit(1);
}

const sql = execFileSync(
  'npx',
  ['prisma', 'migrate', 'diff', '--from-schema-datamodel', previous, '--to-schema-datamodel', schema, '--script'],
  { encoding: 'utf8', shell: process.platform === 'win32' },
);
fs.unlinkSync(previous);

if (!sql.trim() || sql.includes('-- This is an empty migration')) {
  console.log('No schema changes to migrate.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const dir = path.join('prisma', 'migrations', `${stamp}_${name}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'migration.sql'), sql);

console.log(`Wrote ${path.join(dir, 'migration.sql')}:\n`);
console.log(sql.trim());
console.log('\nReview it, then apply with:  npx prisma migrate deploy');
