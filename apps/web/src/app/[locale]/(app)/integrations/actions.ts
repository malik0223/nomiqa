'use server';

import type { ApiKeyIssued, WebhookEndpointIssued } from '@nomiqa/contracts';
import { apiKeyCreateSchema, crmConnectionSchema, webhookEndpointSchema } from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '@/lib/api-client';
import { activeOrganizationId } from '@/lib/cards';

/**
 * إجراءات التكاملات (§11.4 و§11.5).
 *
 * إجراءان هنا يُرجعان سرّاً — إصدار المفتاح وإضافة الوجهة — وهما
 * **المرة الوحيدة** التي يعبر فيها ذلك السرّ إلى المتصفح. لا مسار
 * قراءة يعيده بعدها، ولا تخزين له في أي حالة على العميل.
 */

export interface IntegrationActionResult {
  ok: boolean;
  message?: string;
}

const INTEGRATIONS_PATH = '/[locale]/integrations';

export async function createApiKeyAction(
  input: unknown,
): Promise<IntegrationActionResult & { key?: ApiKeyIssued }> {
  const parsed = apiKeyCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const key = await apiFetch<ApiKeyIssued>('/integrations/api-keys', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(INTEGRATIONS_PATH, 'page');
    return { ok: true, key };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

export async function revokeApiKeyAction(id: string): Promise<IntegrationActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/integrations/api-keys/${id}`, { method: 'DELETE', organizationId });
  });
}

export async function createWebhookAction(
  input: unknown,
): Promise<IntegrationActionResult & { endpoint?: WebhookEndpointIssued }> {
  const parsed = webhookEndpointSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const endpoint = await apiFetch<WebhookEndpointIssued>('/integrations/webhooks', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(INTEGRATIONS_PATH, 'page');
    return { ok: true, endpoint };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

export async function deleteWebhookAction(id: string): Promise<IntegrationActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/integrations/webhooks/${id}`, { method: 'DELETE', organizationId });
  });
}

export async function saveCrmConnectionAction(input: unknown): Promise<IntegrationActionResult> {
  const parsed = crmConnectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/integrations/crm', { method: 'PUT', body: parsed.data, organizationId });
  });
}

export async function disconnectCrmAction(id: string): Promise<IntegrationActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/integrations/crm/${id}`, { method: 'DELETE', organizationId });
  });
}

export async function syncCrmAction(id: string): Promise<IntegrationActionResult> {
  return run(async (organizationId) => {
    await apiFetch(`/integrations/crm/${id}/sync`, { method: 'POST', organizationId });
  });
}

async function run(
  work: (organizationId: string) => Promise<void>,
): Promise<IntegrationActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await work(organizationId);

    revalidatePath(INTEGRATIONS_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : 'تعذّر تنفيذ العملية';
}
