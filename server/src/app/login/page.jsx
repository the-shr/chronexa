import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { prisma } from '@/lib/db.js';
import { verifyPassword, createAdminSession, currentAdmin } from '@/lib/auth.js';
import { normaliseEmail } from '@/lib/user-rules.js';
import { rateLimit, clearRateLimit, clientIp, LOGIN_LIMITS } from '@/lib/rate-limit.js';

export default async function LoginPage({ searchParams }) {
  if (await currentAdmin()) redirect('/dashboard');
  const { error } = await searchParams;

  async function signIn(formData) {
    'use server';
    const email = normaliseEmail(formData.get('email'));
    const password = String(formData.get('password') || '');

    const ip = clientIp(await headers());
    const accountKey = `admin-login:email:${email}`;
    for (const [key, policy] of [
      [`admin-login:ip:${ip}`, LOGIN_LIMITS.perIp],
      [accountKey, LOGIN_LIMITS.perAccount],
    ]) {
      if (!rateLimit(key, policy).allowed) redirect('/login?error=rate');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || user.role !== 'admin' || !verifyPassword(password, user.passwordHash)) {
      redirect('/login?error=1');
    }

    clearRateLimit(accountKey);
    await createAdminSession(user);
    redirect('/dashboard');
  }

  return (
    <div className="login-shell">
      <form className="login-card" action={signIn}>
        <h1>TimeTracker Admin</h1>
        <p className="muted" style={{ margin: 0 }}>
          Sign in with an administrator account.
        </p>
        <input className="input" name="email" type="email" placeholder="Email" required autoFocus />
        <input className="input" name="password" type="password" placeholder="Password" required />
        {error === 'rate' && <p className="error">Too many attempts. Wait a few minutes and try again.</p>}
        {error === '1' && <p className="error">Incorrect email or password.</p>}
        <button className="btn primary" type="submit">
          Sign in
        </button>
      </form>
    </div>
  );
}
