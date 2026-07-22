import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MIN_PASSWORD_LENGTH = 10;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

/**
 * Creates one admin and one employee so the dashboard and the desktop agent can
 * both be signed into immediately. Existing accounts are never given a new
 * password here -- re-running the seed against a live database must not reset
 * anyone's credentials. Use the dashboard for that.
 */
const accounts = [
  {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    name: 'Admin',
    role: 'admin',
    password: process.env.SEED_ADMIN_PASSWORD || 'admin12345',
  },
  {
    email: process.env.SEED_EMPLOYEE_EMAIL || 'employee@example.com',
    name: 'Test Employee',
    role: 'employee',
    password: process.env.SEED_EMPLOYEE_PASSWORD || 'employee1234',
  },
];

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
  console.log(`${user.role.padEnd(8)} ${user.email}  (password: ${account.password})`);
}

console.log('\nSeed complete. Change these passwords before using this in production.');
await prisma.$disconnect();
