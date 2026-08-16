/**
 * وصلة HubSpot (§11.5).
 *
 * ثلاث عمليات فقط: بحث، إنشاء، تحديث. هذا كل ما تحتاجه مزامنة باتجاه
 * واحد بلا تكرار — والبحث أولاً هو ما يمنع إنشاء عميل ثانٍ لشخص موجود
 * في نظام العميل قبل أن نعرفه نحن أصلاً.
 *
 * REST مباشر بلا SDK: ثلاثة نداءات JSON. حزمة مزوّد كاملة لأجلها تعني
 * تحديثاتها وتبعياتها وثغراتها في صورة الـWorker إلى الأبد.
 */

const BASE_URL = 'https://api.hubapi.com';
const TIMEOUT_MS = 15_000;

export interface CrmContactPayload {
  properties: Record<string, string>;
  /** معرّف المالك عند المزوّد. يُترك فارغاً حين لا تحدده الاستراتيجية. */
  ownerRef?: string | null;
}

export interface CrmUpsertResult {
  remoteId: string;
  operation: 'create' | 'update';
}

/**
 * خطأ من نظام العميل.
 *
 * `retryable` ليست تفصيلاً: خطأ 401 لن يُصلحه انتظار، وخطأ 429 لا
 * يُصلحه شيء غيره. خلطهما يعني إما إلحاحاً على نظام يرفضنا، وإما
 * استسلاماً أمام حدّ معدل عابر — وكلاهما يفقد عملاء محتملين.
 */
export class CrmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CrmError';
  }
}

export async function upsertHubspotContact(
  accessToken: string,
  payload: CrmContactPayload,
): Promise<CrmUpsertResult> {
  const email = payload.properties.email;

  // البحث بالبريد وحده: هو المفتاح الذي يعرّف جهة الاتصال في HubSpot
  // نفسه، والبحث بالاسم يطابق أشخاصاً مختلفين يحملون الاسم ذاته —
  // ودمج عميلين مختلفين أسوأ من إنشاء صف مكرر.
  const existingId = email ? await findByEmail(accessToken, email) : null;

  const properties = { ...payload.properties };
  if (payload.ownerRef) {
    properties.hubspot_owner_id = payload.ownerRef;
  }

  if (existingId) {
    await request(accessToken, `/crm/v3/objects/contacts/${existingId}`, 'PATCH', { properties });
    return { remoteId: existingId, operation: 'update' };
  }

  const created = await request<{ id?: string }>(
    accessToken,
    '/crm/v3/objects/contacts',
    'POST',
    { properties },
  );

  if (!created.id) {
    throw new CrmError('لم يُرجع المزوّد معرّفاً للسجل المنشأ', false);
  }

  return { remoteId: created.id, operation: 'create' };
}

async function findByEmail(accessToken: string, email: string): Promise<string | null> {
  const found = await request<{ results?: Array<{ id?: string }> }>(
    accessToken,
    '/crm/v3/objects/contacts/search',
    'POST',
    {
      filterGroups: [
        { filters: [{ propertyName: 'email', operator: 'EQ', value: email }] },
      ],
      properties: ['email'],
      limit: 1,
    },
  );

  return found.results?.[0]?.id ?? null;
}

async function request<T>(
  accessToken: string,
  path: string,
  method: string,
  body: unknown,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // انقطاع أو مهلة: قابل للإعادة دائماً.
    throw new CrmError((error as Error).message.slice(0, 200), true);
  }

  if (response.ok) {
    return (await response.json()) as T;
  }

  // 429 وكل 5xx قابلة للإعادة؛ 4xx غيرها خلل في الإعداد أو البيانات
  // ولن يتغير بمحاولة ثانية.
  const retryable = response.status === 429 || response.status >= 500;
  const detail = await readErrorMessage(response);

  throw new CrmError(detail, retryable, response.status);
}

/**
 * يقرأ رسالة الخطأ من المزوّد.
 *
 * تُعرض لصاحب الوصلة في السجل، فلا بد أن تكون مفهومة: «الحقل غير
 * موجود» يوجّهه إلى خريطة الحقول مباشرة، بينما «فشل» لا يقول شيئاً.
 * محدودة الطول لئلا يبتلع ردٌّ طويل عمود السجل.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; category?: string };
    return (body.message ?? body.category ?? `الحالة ${response.status}`).slice(0, 300);
  } catch {
    return `الحالة ${response.status}`;
  }
}
