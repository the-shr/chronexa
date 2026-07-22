import { PrismaClient } from '@prisma/client';

// Next dev reloads modules on every edit; caching on globalThis stops the
// connection pool from growing without bound.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
