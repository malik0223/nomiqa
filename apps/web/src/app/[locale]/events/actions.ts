'use server';

import { eventSchema } from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { activeOrganizationId } from '../../../lib/cards';

/** إجراءات الفعاليات (§11.3). */

export interface EventActionResult {
  ok: boolean;
  message?: string;
}

const EVENTS_PATH = '/[locale]/events';

export async function createEventAction(input: unknown): Promise<EventActionResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/events', { method: 'POST', body: parsed.data, organizationId });
  });
}

export async function updateEventAction(id: string, input: unknown): Promise<EventActionResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch(`/events/${id}`, { method: 'PUT', body: parsed.data, organizationId });
  });
}

export async function deleteEventAction(id: string): Promise<EventActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/events/${id}`, { method: 'DELETE', organizationId });
  });
}

async function run(work: (organizationId: string) => Promise<void>): Promise<EventActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await work(organizationId);

    revalidatePath(EVENTS_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof ApiError ? error.message : 'تعذّر تنفيذ العملية' };
  }
}
