'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import type { CardDetail } from '@nomiqa/contracts';
import {
  cardUpdateFieldsSchema,
  createCardSchema,
  slugSchema,
  type CardUpdateFieldsInput,
  type CreateCardInput,
} from '@nomiqa/validation';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { activeOrganizationId, publicCardTag } from '../../../lib/cards';

/**
 * إجراءات البطاقات.
 *
 * كل استدعاء للـAPI يمر من الخادم: الـAccess Token لا يصل إلى المتصفح
 * إطلاقاً، والمكوّن العميل يستدعي دالة لا نقطة نهاية.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** يميّز تعارض الإصدارات عن أي فشل آخر — المحرر يعالجه بواجهة خاصة. */
  conflict?: boolean;
}

export interface SaveResult extends ActionResult {
  card?: CardDetail;
  /** أسباب منع النشر، كل سبب سطر مستقل. */
  details?: string[];
}

export async function createCardAction(
  input: CreateCardInput,
): Promise<{ ok: true; cardId: string } | { ok: false; message?: string }> {
  const parsed = createCardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const card = await apiFetch<CardDetail>('/cards', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath('/[locale]/cards', 'page');
    return { ok: true, cardId: card.id };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/**
 * يحفظ المسودة.
 *
 * `revision` يُرسل دائماً ويُعاد دائماً: المحرر يحفظ تلقائياً، فبدون
 * تدقيق الإصدار تمحو نافذةٌ عملَ الأخرى بلا إشعار (§4.5).
 */
export async function saveCardAction(
  cardId: string,
  revision: number,
  fields: CardUpdateFieldsInput,
): Promise<SaveResult> {
  // نفس المخطط المستخدم في الـAPI — التحقق هنا للتجربة، وهناك للحقيقة.
  const parsed = cardUpdateFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue ? `${issue.path.join('.')}: ${issue.message}` : undefined };
  }

  try {
    const organizationId = await activeOrganizationId();
    const card = await apiFetch<CardDetail>(`/cards/${cardId}`, {
      method: 'PATCH',
      body: { revision, ...parsed.data },
      organizationId,
    });

    return { ok: true, card };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, conflict: true, message: error.message };
    }
    return { ok: false, message: describe(error) };
  }
}

export async function publishCardAction(cardId: string, slug: string): Promise<SaveResult> {
  try {
    const organizationId = await activeOrganizationId();
    const card = await apiFetch<CardDetail>(`/cards/${cardId}/publish`, {
      method: 'POST',
      organizationId,
    });

    // إبطال النسخة المخزَّنة فور النشر: التخزين المؤقت يخدم السرعة،
    // لكن بطاقة نُشرت ولا تظهر تحديثاتها تبدو للمستخدم عطلاً لا سرعة.
    revalidateTag(publicCardTag(slug));
    revalidatePath('/[locale]/cards', 'page');

    return { ok: true, card };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { ok: false, conflict: true, message: error.message };
    }
    if (error instanceof ApiError && error.details) {
      return {
        ok: false,
        message: error.message,
        details: error.details.map((detail) => detail.message),
      };
    }
    return { ok: false, message: describe(error) };
  }
}

export async function unpublishCardAction(cardId: string, slug: string): Promise<SaveResult> {
  try {
    const organizationId = await activeOrganizationId();
    const card = await apiFetch<CardDetail>(`/cards/${cardId}/unpublish`, {
      method: 'POST',
      organizationId,
    });

    revalidateTag(publicCardTag(slug));
    revalidatePath('/[locale]/cards', 'page');

    return { ok: true, card };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function deleteCardAction(cardId: string, slug: string): Promise<ActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/cards/${cardId}`, { method: 'DELETE', organizationId });

    revalidateTag(publicCardTag(slug));
    revalidatePath('/[locale]/cards', 'page');

    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function checkSlugAction(
  slug: string,
): Promise<{ available: boolean; message?: string }> {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    return { available: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const result = await apiFetch<{ slug: string; available: boolean }>(
      `/cards/slug-availability?slug=${encodeURIComponent(parsed.data)}`,
      { organizationId },
    );
    return { available: result.available };
  } catch (error) {
    return { available: false, message: describe(error) };
  }
}

// ---------------------------------------------------------------
// رفع الصور
// ---------------------------------------------------------------

export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
}

/**
 * يطلب رابط رفع موقّعاً.
 *
 * المتصفح يرفع **مباشرة إلى التخزين** بهذا الرابط، فلا يمر الحمل
 * الثنائي عبر الويب ولا الـAPI (§8). الرابط قصير العمر ويصلح لمفتاح
 * واحد بعينه.
 */
export async function requestUploadAction(input: {
  purpose: 'avatar' | 'cover' | 'logo';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ ok: true; ticket: UploadTicket } | { ok: false; message?: string }> {
  try {
    const organizationId = await activeOrganizationId();
    const ticket = await apiFetch<{ fileId: string; uploadUrl: string }>('/files/upload-url', {
      method: 'POST',
      body: input,
      organizationId,
    });

    return { ok: true, ticket };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/** يؤكّد الرفع. الـAPI يتحقق من وجود الكائن وحجمه الحقيقي قبل اعتماده. */
export async function confirmUploadAction(fileId: string): Promise<ActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/files/${fileId}/confirm`, { method: 'POST', organizationId });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

function describe(error: unknown): string | undefined {
  return error instanceof ApiError ? error.message : undefined;
}
