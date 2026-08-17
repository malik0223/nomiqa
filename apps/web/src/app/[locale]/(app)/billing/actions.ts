'use server';

import type { CheckoutResult, PlanChangePreview } from '@nomiqa/contracts';
import {
  billingProfileSchema,
  cancelSubscriptionSchema,
  createTicketSchema,
  startSubscriptionSchema,
} from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '@/lib/api-client';
import { activeOrganizationId } from '@/lib/cards';

/**
 * إجراءات الفوترة (§9.4).
 *
 * لا يمس أيٌّ منها مبلغاً: الأسعار والخصم والضريبة تُحسب في الخادم
 * كلها. ما يُرسَل من هنا نيّة — «أريد باقة الفرق شهرياً بكود خصم س» —
 * والخادم يترجمها إلى مبلغ. تمرير مبلغ من المتصفح كان سيجعل السعر
 * قابلاً للتفاوض في أدوات المطوّر.
 */

export interface BillingActionResult {
  ok: boolean;
  message?: string;
}

const BILLING_PATH = '/[locale]/billing';

export async function previewPlanAction(
  input: unknown,
): Promise<BillingActionResult & { preview?: PlanChangePreview }> {
  const parsed = startSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const preview = await apiFetch<PlanChangePreview>('/billing/preview', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    return { ok: true, preview };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/**
 * بدء اشتراك أو تغيير باقة.
 *
 * يعيد `checkoutUrl` حين يلزم دفع، و`activated` حين لا يلزم (تجربة،
 * أو خفض إلى المجانية، أو خصم غطّى المبلغ). المكوّن يوجّه أو يُحدّث
 * بحسب النتيجة بدل افتراض أن كل تغيير باقة يمر ببوابة دفع.
 */
export async function checkoutAction(
  input: unknown,
): Promise<BillingActionResult & { result?: CheckoutResult }> {
  const parsed = startSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const result = await apiFetch<CheckoutResult>('/billing/checkout', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(BILLING_PATH, 'page');
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/**
 * تأكيد نتيجة الدفع بعد عودة المتصفح.
 *
 * لا يصدّق ما في الرابط: الخادم يستعلم البوابة. فتح رابط العودة يدوياً
 * بـ`status=success` لا يفعّل شيئاً.
 */
export async function confirmPaymentAction(
  reference: string,
): Promise<BillingActionResult & { status?: string }> {
  try {
    const organizationId = await activeOrganizationId();
    const result = await apiFetch<{ status: string }>(
      `/billing/confirm/${encodeURIComponent(reference)}`,
      { method: 'POST', organizationId },
    );

    revalidatePath(BILLING_PATH, 'page');
    return { ok: true, status: result.status };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function cancelSubscriptionAction(input: unknown): Promise<BillingActionResult> {
  const parsed = cancelSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/billing/cancel', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });
  });
}

export async function resumeSubscriptionAction(): Promise<BillingActionResult> {
  return run(async (organizationId) => {
    await apiFetch('/billing/resume', { method: 'POST', organizationId });
  });
}

export async function updateBillingProfileAction(input: unknown): Promise<BillingActionResult> {
  const parsed = billingProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  return run(async (organizationId) => {
    await apiFetch('/billing/profile', {
      method: 'PUT',
      body: parsed.data,
      organizationId,
    });
  });
}

export async function payInvoiceAction(
  invoiceId: string,
): Promise<BillingActionResult & { checkoutUrl?: string }> {
  try {
    const organizationId = await activeOrganizationId();
    const result = await apiFetch<{ checkoutUrl: string }>(
      `/billing/invoices/${invoiceId}/checkout`,
      { method: 'POST', organizationId },
    );

    return { ok: true, checkoutUrl: result.checkoutUrl };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function createTicketAction(
  input: unknown,
): Promise<BillingActionResult & { id?: string }> {
  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const result = await apiFetch<{ id: string }>('/support/tickets', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath('/[locale]/support', 'page');
    return { ok: true, id: result.id };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function replyToTicketAction(
  ticketId: string,
  body: string,
): Promise<BillingActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/support/tickets/${ticketId}/reply`, {
      method: 'POST',
      body: { body },
      organizationId,
    });

    revalidatePath('/[locale]/support/[id]', 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

async function run(
  work: (organizationId: string) => Promise<void>,
): Promise<BillingActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await work(organizationId);

    revalidatePath(BILLING_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof ApiError ? error.message : 'تعذّر تنفيذ العملية';
}
