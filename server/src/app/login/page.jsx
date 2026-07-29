import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { prisma } from '@/lib/db.js';
import { verifyPassword, createAdminSession, currentAdmin } from '@/lib/auth.js';
import { normaliseEmail } from '@/lib/user-rules.js';
import { rateLimit, clearRateLimit, clientIp, LOGIN_LIMITS } from '@/lib/rate-limit.js';
import { loginViaHub } from '@/lib/ecosystem-login.js';

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
      const { allowed } = await rateLimit(key, policy);
      if (!allowed) redirect('/login?error=rate');
    }

    // Hub first (it also mirrors the account locally), then a local password for
    // the break-glass admin. The dashboard is admin-only, so a non-admin who
    // authenticates is still turned away here -- they use the desktop app.
    let user = await loginViaHub(email, password);
    if (!user) {
      const local = await prisma.user.findUnique({ where: { email } });
      if (local?.active && local.passwordHash && verifyPassword(password, local.passwordHash)) {
        user = local;
      }
    }
    if (!user || !user.active || user.role !== 'admin') {
      redirect('/login?error=1');
    }

    await clearRateLimit(accountKey);
    await createAdminSession(user);
    redirect('/dashboard');
  }

  return (
    <div className="login-shell">
      <form className="login-card" action={signIn}>
        <h1>Chronexa Admin</h1>
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
