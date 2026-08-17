import 'server-only';
import type { ApiErrorBody } from '@nomiqa/contracts';
import { auth0 } from './auth0';
import { demoResponse, isDemoMode } from './demo/fixtures';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    /** أخطاء الحقول كما يرسلها الـAPI — تُعرض كقائمة لا كرسالة واحدة. */
    readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** معرّف المؤسسة النشطة. يُحذف في مسارات الإقلاع مثل /me. */
  organizationId?: string;
  body?: unknown;
}

/**
 * يستدعي NestJS API نيابةً عن المستخدم الحالي.
 *
 * **يعمل على الخادم فقط.** الـAccess Token لا يصل إلى المتصفح إطلاقاً:
 * الجلسة كوكي مشفّر `HttpOnly`، وهذه الدالة تفكّها على الخادم وترسل
 * الرمز إلى الـAPI. لذلك `server-only` في الأعلى — أي استيراد من مكوّن
 * عميل يفشل عند البناء بدل أن يسرّب الرمز صامتاً.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { organizationId, body, headers, ...rest } = options;

  // وضع العرض: يُشغَّل يدوياً بـ`NOMIQA_DEMO=1` لالتقاط لقطات دليل
  // الاستخدام من الشاشات الحقيقية. لا يمسّ أي مسار إنتاجي — المتغيّر
  // غائب في كل بيئة أخرى، فيمر النداء كالمعتاد. راجع lib/demo/fixtures.
  if (isDemoMode()) {
    const fixture = demoResponse(path);
    if (fixture !== undefined) {
      return fixture as T;
    }
    throw new ApiError(404, 'DEMO_NOT_FOUND', `لا بيانات عرض للمسار ${path}`);
  }

  const { token } = await auth0.getAccessToken();

  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(organizationId ? { 'x-organization-id': organizationId } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    // بيانات المستخدم لا تُخزَّن مؤقتاً بين الطلبات.
    cache: 'no-store',
  });

  if (!response.ok) {
    let code = 'UNKNOWN';
    let message = `فشل الطلب (${response.status})`;
    let requestId: string | undefined;
    let details: ApiErrorBody['error']['details'];

    try {
      const errorBody = (await response.json()) as ApiErrorBody;
      code = errorBody.error?.code ?? code;
      message = errorBody.error?.message ?? message;
      requestId = errorBody.error?.requestId;
      details = errorBody.error?.details;
    } catch {
      // الاستجابة ليست JSON — نبقي الرسالة العامة.
    }

    throw new ApiError(response.status, code, message, requestId, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
