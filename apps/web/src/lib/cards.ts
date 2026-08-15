import 'server-only';
import type {
  CardDetail,
  CardEntitlements,
  CardSummary,
  MeResponse,
  PublicCardPage,
  TemplateSummary,
} from '@nomiqa/contracts';
import { apiFetch } from './api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * المؤسسة النشطة للمستخدم الحالي.
 *
 * كل مسار بطاقات يحتاجها لترويسة `x-organization-id`. تُقرأ من `/me`
 * في كل طلب لا من الجلسة: تعطيل العضوية يجب أن يمنع الوصول فوراً،
 * وقيمة محفوظة في كوكي تؤخر ذلك إلى انتهاء الجلسة.
 */
export async function activeOrganizationId(): Promise<string> {
  const me = await apiFetch<MeResponse>('/me');
  const organization = me.organizations[0];

  if (!organization) {
    throw new Error('لا توجد مؤسسة نشطة لهذا المستخدم');
  }

  return organization.id;
}

export async function fetchCards(organizationId: string): Promise<CardSummary[]> {
  return apiFetch<CardSummary[]>('/cards', { organizationId });
}

export async function fetchCard(organizationId: string, cardId: string): Promise<CardDetail> {
  return apiFetch<CardDetail>(`/cards/${cardId}`, { organizationId });
}

export async function fetchTemplates(organizationId: string): Promise<TemplateSummary[]> {
  return apiFetch<TemplateSummary[]>('/cards/templates', { organizationId });
}

export async function fetchEntitlements(organizationId: string): Promise<CardEntitlements> {
  return apiFetch<CardEntitlements>('/cards/entitlements', { organizationId });
}

/** وسم التخزين المؤقت للبطاقة العامة. النشر يُبطله فيظهر التحديث فوراً. */
export function publicCardTag(slug: string): string {
  return `public-card:${slug}`;
}

/**
 * اللقطة المنشورة لصفحة عامة.
 *
 * **بلا رمز وصول عمداً**: هذه الصفحة تُفتح لزائر مجهول (§7.5)، ولو
 * مرّرنا جلسة المستخدم هنا لصار لكل زائر استجابة مختلفة ولتعذّر
 * تخزينها. النتيجة تُخزَّن بوسم يُبطله النشر وحده.
 */
export async function fetchPublicCard(slug: string): Promise<PublicCardPage | null> {
  const response = await fetch(`${API_URL}/api/v1/public/cards/${encodeURIComponent(slug)}`, {
    next: { revalidate: 300, tags: [publicCardTag(slug)] },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`تعذّر جلب البطاقة (${response.status})`);
  }

  return (await response.json()) as PublicCardPage;
}

/** الرابط العام الثابت. لا يتغير بتحديث البطاقة — وعليه يعتمد كل QR مطبوع. */
export function publicCardUrl(slug: string): string {
  const base = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/${slug}`;
}
