import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MIN_PASSWORD_LENGTH = 10;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

/**
 * Creates the first administrator, so there is someone who can sign in and add
 * everybody else. Employees are not seeded: there is no self-signup by design,
 * and an admin adds each person from the People tab.
 *
 * A demo employee is only created when SEED_EMPLOYEE_EMAIL is set, which is for
 * trying the agent out locally -- a real deployment should not have one.
 *
 * Existing accounts are never given a new password here: re-running this against
 * a live database must not reset anyone's credentials.
 */
const accounts = [
  {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    name: process.env.SEED_ADMIN_NAME || 'Admin',
    role: 'admin',
    password: process.env.SEED_ADMIN_PASSWORD || 'admin12345',
  },
];

if (process.env.SEED_EMPLOYEE_EMAIL) {
  accounts.push({
    email: process.env.SEED_EMPLOYEE_EMAIL,
    name: process.env.SEED_EMPLOYEE_NAME || 'Test Employee',
    role: 'employee',
    password: process.env.SEED_EMPLOYEE_PASSWORD || 'employee1234',
  });
}

// Shipping the built-in default to a real deployment would leave a known
// password on an admin account. Refuse rather than warn.
const usingDefaults = !process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD;
if (usingDefaults && process.env.NODE_ENV === 'production') {
  console.error(`
Refusing to seed the built-in admin in production.

Set these first, then run this again:

  SEED_ADMIN_EMAIL="you@yourcompany.com"
  SEED_ADMIN_NAME="Your Name"
  SEED_ADMIN_PASSWORD="something long and private"
`);
  process.exit(1);
}

for (const account of accounts) {
  if (account.password.length < MIN_PASSWORD_LENGTH || !/[a-zA-Z]/.test(account.password) || !/[0-9]/.test(account.password)) {
    console.error(`Refusing to seed ${account.email}: password must be ${MIN_PASSWORD_LENGTH}+ chars with letters and numbers.`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: account.email } });
  if (existing) {
    console.log(`${existing.role.padEnd(8)} ${existing.email}  (already exists — password unchanged)`);
    continue;
  }

  const user = await prisma.user.create({
    data: {
      email: account.email,
      name: account.name,
      role: account.role,
      passwordHash: hashPassword(account.password),
    },
  });
  console.log(`${user.role.padEnd(8)} ${user.email}  created`);
}

console.log(`
Done. Sign in as the admin, then add each employee from People -> +.
They sign in to the desktop app with the email and password you give them,
and change the password themselves from Profile.
`);

await prisma.$disconnect();
