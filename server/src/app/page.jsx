import { redirect } from 'next/navigation';

import { currentAdmin } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

export default async function Home() {
  redirect((await currentAdmin()) ? '/dashboard' : '/login');
}
