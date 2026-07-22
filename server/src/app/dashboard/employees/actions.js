'use server';

import { revalidatePath } from 'next/cache';

import { currentAdmin } from '@/lib/auth.js';
import { createUser, setUserActive, resetUserPassword, revokeUserDevices, setUserRole } from '@/lib/users.js';

/** Every action re-checks the session: a stale form must not carry authority. */
async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) throw new Error('Not signed in as an administrator.');
  return admin;
}

function refresh() {
  revalidatePath('/dashboard/employees');
  revalidatePath('/dashboard');
}

export async function createEmployee(_prevState, formData) {
  await requireAdmin();
  const result = await createUser({
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
    password: String(formData.get('password') || ''),
  });
  if (result.error) return { error: result.error };

  refresh();
  return { success: `${result.user.name} can now sign in from the desktop app.` };
}

export async function setActive(formData) {
  const admin = await requireAdmin();
  const result = await setUserActive(String(formData.get('userId') || ''), formData.get('active') === 'true', {
    actingAdminId: admin.id,
  });
  if (result.error) throw new Error(result.error);
  refresh();
}

export async function resetPassword(_prevState, formData) {
  await requireAdmin();
  const userId = String(formData.get('userId') || '');
  const result = await resetUserPassword(userId, String(formData.get('password') || ''));
  if (result.error) return { error: result.error, userId };

  refresh();
  return { success: 'Password updated. The employee must sign in again on every device.', userId };
}

export async function revokeDevices(formData) {
  await requireAdmin();
  await revokeUserDevices(String(formData.get('userId') || ''));
  refresh();
}

export async function setRole(formData) {
  const admin = await requireAdmin();
  const result = await setUserRole(String(formData.get('userId') || ''), formData.get('role'), {
    actingAdminId: admin.id,
  });
  if (result.error) throw new Error(result.error);
  refresh();
}
