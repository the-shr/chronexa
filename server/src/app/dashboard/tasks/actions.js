'use server';

import { revalidatePath } from 'next/cache';

import { currentAdmin } from '@/lib/auth.js';
import { assignTask, updateTask, reassignTask, deleteTask } from '@/lib/tasks.js';

/** Every action re-checks the session: a stale form must not carry authority. */
async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) throw new Error('Not signed in as an administrator.');
  return admin;
}

function refresh() {
  revalidatePath('/dashboard/tasks');
  revalidatePath('/dashboard');
}

export async function createTask(_prevState, formData) {
  const admin = await requireAdmin();
  const result = await assignTask({
    userId: formData.get('userId'),
    title: formData.get('title'),
    description: formData.get('description'),
    priority: formData.get('priority'),
    dueAt: formData.get('dueAt'),
    estimateMinutes: formData.get('estimateMinutes'),
    createdById: admin.id,
  });
  if (result.error) return { error: result.error };

  refresh();
  return { success: `Assigned "${result.task.title}".` };
}

export async function editTask(_prevState, formData) {
  await requireAdmin();
  const result = await updateTask(formData.get('id'), {
    title: formData.get('title'),
    description: formData.get('description'),
    priority: formData.get('priority'),
    dueAt: formData.get('dueAt'),
    estimateMinutes: formData.get('estimateMinutes'),
  });
  if (result.error) return { error: result.error, id: formData.get('id') };

  refresh();
  return { success: 'Saved.', id: formData.get('id') };
}

export async function setTaskStatus(formData) {
  await requireAdmin();
  const result = await updateTask(formData.get('id'), { status: formData.get('status') });
  if (result.error) throw new Error(result.error);
  refresh();
}

export async function moveTask(formData) {
  await requireAdmin();
  const result = await reassignTask(formData.get('id'), formData.get('userId'));
  if (result.error) throw new Error(result.error);
  refresh();
}

export async function removeTask(formData) {
  await requireAdmin();
  const result = await deleteTask(formData.get('id'));
  if (result.error) throw new Error(result.error);
  refresh();
}
