'use server';

import type { ScanJobSummary } from '@nomiqa/contracts';
import { qrScanSchema, scanConfirmSchema, uploadRequestSchema } from '@nomiqa/validation';
import { revalidatePath } from 'next/cache';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { activeOrganizationId } from '../../../lib/cards';

/**
 * إجراءات المسح (§11.2).
 *
 * الرفع يجري **من المتصفح إلى التخزين مباشرة** برابط موقّع يطلبه هذا
 * الملف: صورة بطاقة من هاتف تبلغ عدة ميغابايت، وتمريرها عبر إجراء
 * خادمي يعني عبور الحمل الثنائي في مسار الطلب مرتين. القاعدة 2 في
 * README تقول هذا صراحةً — الملفات لا تُقدَّم ولا تُرفع عبر التطبيق.
 */

export interface ScanActionResult {
  ok: boolean;
  message?: string;
}

export interface UploadTicketResult extends ScanActionResult {
  fileId?: string;
  uploadUrl?: string;
}

const SCAN_PATH = '/[locale]/scan';

export async function requestScanUploadAction(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<UploadTicketResult> {
  const parsed = uploadRequestSchema.safeParse({ ...input, purpose: 'scan' });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const ticket = await apiFetch<{ fileId: string; uploadUrl: string }>('/files/upload-url', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    return { ok: true, fileId: ticket.fileId, uploadUrl: ticket.uploadUrl };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

/**
 * يؤكّد الرفع ويبدأ الاستخراج.
 *
 * التأكيد أولاً: الـAPI يتحقق من وجود الكائن وحجمه الحقيقي في التخزين
 * قبل أن نُنشئ عملية مسح تشير إلى ملف قد لا يكون وصل أصلاً.
 */
export async function startScanAction(input: {
  fileId: string;
  kind: string;
  eventId: string | null;
}): Promise<ScanActionResult & { scan?: ScanJobSummary }> {
  try {
    const organizationId = await activeOrganizationId();

    await apiFetch(`/files/${input.fileId}/confirm`, { method: 'POST', organizationId });

    const scan = await apiFetch<ScanJobSummary>('/scans', {
      method: 'POST',
      body: { fileId: input.fileId, kind: input.kind, eventId: input.eventId },
      organizationId,
    });

    revalidatePath(SCAN_PATH, 'page');
    return { ok: true, scan };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

export async function scanQrAction(input: {
  payload: string;
  eventId: string | null;
}): Promise<ScanActionResult & { scan?: ScanJobSummary }> {
  const parsed = qrScanSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const scan = await apiFetch<ScanJobSummary>('/scans/qr', {
      method: 'POST',
      body: parsed.data,
      organizationId,
    });

    revalidatePath(SCAN_PATH, 'page');
    return { ok: true, scan };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

/** يحفظ ما راجعه المستخدم جهةَ اتصال. */
export async function confirmScanAction(
  scanId: string,
  input: unknown,
): Promise<ScanActionResult & { isDuplicate?: boolean }> {
  const parsed = scanConfirmSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  try {
    const organizationId = await activeOrganizationId();
    const result = await apiFetch<{ contactId: string; isDuplicate: boolean }>(
      `/scans/${scanId}/contact`,
      { method: 'POST', body: parsed.data, organizationId },
    );

    revalidatePath(SCAN_PATH, 'page');
    return { ok: true, isDuplicate: result.isDuplicate };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

export async function discardScanAction(scanId: string): Promise<ScanActionResult> {
  try {
    const organizationId = await activeOrganizationId();
    await apiFetch(`/scans/${scanId}`, { method: 'DELETE', organizationId });

    revalidatePath(SCAN_PATH, 'page');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: message(error) };
  }
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : 'تعذّر تنفيذ العملية';
}
