import 'server-only';
import type {
  CampaignReport,
  CampaignSummary,
  CardSummary,
  MeetingBackgroundPayload,
  NfcTagSummary,
  ShareTargetResolution,
  SignaturePayload,
  SignatureTemplateSummary,
  WalletAvailability,
} from '@nomiqa/contracts';
import { apiFetch } from './api-client';

/**
 * قراءات الحضور المهني المتكامل (المرحلة 5).
 *
 * كلها خادمية عدا حل الكود القصير: قائمة وسوم NFC تكشف أين وزّعت
 * المؤسسة حضورها المادي، وقائمة الحملات تكشف خطتها التسويقية. لا شيء
 * منهما يحتمل رمز وصول في المتصفح.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function fetchNfcTags(organizationId: string): Promise<NfcTagSummary[]> {
  return apiFetch<NfcTagSummary[]>('/nfc/tags', { organizationId });
}

export async function fetchCampaigns(organizationId: string): Promise<CampaignSummary[]> {
  return apiFetch<CampaignSummary[]>('/campaigns', { organizationId });
}

export async function fetchCampaignReport(
  organizationId: string,
  campaignId: string,
  range: string,
): Promise<CampaignReport> {
  return apiFetch<CampaignReport>(
    `/campaigns/${campaignId}/report?range=${encodeURIComponent(range)}`,
    { organizationId },
  );
}

export async function fetchSignature(
  organizationId: string,
  cardId: string,
  locale: string,
): Promise<SignaturePayload> {
  return apiFetch<SignaturePayload>(
    `/signatures?cardId=${encodeURIComponent(cardId)}&locale=${encodeURIComponent(locale)}`,
    { organizationId },
  );
}

export async function fetchSignatureTemplates(
  organizationId: string,
): Promise<SignatureTemplateSummary[]> {
  return apiFetch<SignatureTemplateSummary[]>('/signatures/templates', { organizationId });
}

export async function fetchMeetingBackground(
  organizationId: string,
  query: { cardId: string; platform: string; locale: string; scheme: string; showQr: boolean },
): Promise<MeetingBackgroundPayload> {
  const search = new URLSearchParams({
    cardId: query.cardId,
    platform: query.platform,
    locale: query.locale,
    scheme: query.scheme,
    showQr: String(query.showQr),
  });

  return apiFetch<MeetingBackgroundPayload>(`/meeting-backgrounds?${search.toString()}`, {
    organizationId,
  });
}

export async function fetchWalletAvailability(
  organizationId: string,
): Promise<WalletAvailability> {
  return apiFetch<WalletAvailability>('/wallets/availability', { organizationId });
}

/** البطاقات المنشورة وحدها — الوسم والحملة والتوقيع كلها تشير إلى رابط عام. */
export function publishedCards(cards: CardSummary[]): CardSummary[] {
  return cards.filter((card) => card.status === 'published');
}

/**
 * يحل كوداً قصيراً إلى بطاقته.
 *
 * **بلا رمز وصول**: يُستدعى من مسار `/t/<code>` الذي يفتحه زائر مجهول
 * يحمل وسم NFC أو يمسح رمزاً مطبوعاً. تمرير جلسة هنا كان يجعل الوسم
 * يعمل لصاحبه ولا يعمل لمن سلّمه إليه.
 */
export async function resolveShareCode(code: string): Promise<ShareTargetResolution | null> {
  const response = await fetch(
    `${API_URL}/api/v1/public/share/${encodeURIComponent(code)}`,
    // بلا تخزين: الوسم قد يُعاد توجيهه أو يُبطل في أي لحظة، ونسخة
    // مخزَّنة تعني وسماً مُبطلاً يظل يعمل حتى انتهاء المهلة.
    { cache: 'no-store' },
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as ShareTargetResolution;
}
