/**
 * Pure task constants with no Node or Prisma imports, so client components can
 * share them with the server. Anything touching the database belongs in
 * tasks.js -- importing that from a client component would pull @prisma/client
 * into the browser bundle and fail the build.
 */

export const PRIORITIES = ['low', 'normal', 'high'];
export const STATUSES = ['open', 'done'];
