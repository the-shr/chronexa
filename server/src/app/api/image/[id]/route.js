import fs from 'node:fs/promises';

import { prisma } from '@/lib/db.js';
import { currentAdmin } from '@/lib/auth.js';
import { resolveUpload } from '@/lib/storage.js';

/** Serves a stored screenshot. Admin-only -- these are employees' screens. */
export async function GET(_request, { params }) {
  const admin = await currentAdmin();
  if (!admin) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const row = await prisma.screenshot.findUnique({ where: { id } });
  if (!row) return new Response('Not found', { status: 404 });

  const absolute = resolveUpload(row.storagePath);
  if (!absolute) return new Response('Not found', { status: 404 });

  try {
    const bytes = await fs.readFile(absolute);
    return new Response(bytes, {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(bytes.length),
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Image file missing', { status: 404 });
  }
}
