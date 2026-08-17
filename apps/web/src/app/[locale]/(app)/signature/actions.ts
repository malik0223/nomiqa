'use server';

import type { MeetingBackgroundPayload, SignaturePayload } from '@nomiqa/contracts';
import { meetingBackgroundQuerySchema, signatureProfileSchema } from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '@/lib/api-client';
import { activeOrganizationId } from '@/lib/cards';
import { fetchMeetingBackground } from '@/lib/presence';

/** إجراءات التوقيع وخلفيات الاجتماعات (§10.3). */

export interface SignatureActionResult {
  ok: boolean;
  message?: string;
  signature?: SignaturePayload;
}

const SIGNATURE_PATH = '/[locale]/signature';

/**
 * يحفظ اختيار التوقيع ويعيد الناتج المحدَّث.
 *
 * الحفظ والمعاينة في رحلة واحدة عمداً: المستخدم يغيّر خياراً ليرى
 * الأثر، ورحلتان متتاليتان كانتا تُظهران التوقيع القديم لحظةً بعد
 * الحفظ — فيظن أن الخيار لم يُطبَّق.
 */
export async function saveSignatureAction(input: unknown): Promise<SignatureActionResult> {
  const parsed = signatureProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();

    const signature = await apiFetch<SignaturePayload>('/signatures', {
      method: 'PUT',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(SIGNATURE_PATH, 'page');
    return { ok: true, signature };
  } catch (error) {
    return { ok: false, message: error instanceof ApiError ? error.message : 'تعذّر حفظ التوقيع' };
  }
}

export interface BackgroundActionResult {
  ok: boolean;
  message?: string;
  background?: MeetingBackgroundPayload;
}

/**
 * يولّد خلفية اجتماع.
 *
 * إجراء خادمي لا استدعاء من المتصفح: الخلفية تُبنى من اللقطة المنشورة
 * وتحتاج رمز وصول، وتمريره إلى العميل ليطلبها بنفسه كان يسرّبه.
 */
export async function generateBackgroundAction(input: unknown): Promise<BackgroundActionResult> {
  const parsed = meetingBackgroundQuerySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const background = await fetchMeetingBackground(organizationId, parsed.data);

    return { ok: true, background };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiError ? error.message : 'تعذّر توليد الخلفية',
    };
  }
}
