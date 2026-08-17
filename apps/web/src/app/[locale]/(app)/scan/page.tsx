import type { EventSummary, ScanAvailability, ScanJobSummary } from '@nomiqa/contracts';
import { PageHeader } from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@/lib/api-client';
import { activeOrganizationId } from '@/lib/cards';
import { fetchEvents, fetchPendingScans, fetchScanAvailability, runningEvents } from '@/lib/sales';
import { ScanPanel } from './scan-panel';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** شاشة مسح البطاقات والشارات (§11.2). */
export default async function ScanPage({ params }: PageProps) {
  await params;
  const t = await getTranslations();

  let scans: ScanJobSummary[];
  let events: EventSummary[];
  let availability: ScanAvailability;

  try {
    const organizationId = await activeOrganizationId();

    [scans, events, availability] = await Promise.all([
      fetchPendingScans(organizationId).catch(() => [] as ScanJobSummary[]),
      fetchEvents(organizationId).catch(() => [] as EventSummary[]),
      fetchScanAvailability(organizationId),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <PageHeader eyebrow={t('nav.groups.relations')} title={t('scan.title')} />
        <p className="mt-4 text-muted">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={t('nav.groups.relations')}
        title={t('scan.title')}
        description={t('scan.intro')}
      />

      <ScanPanel
        scans={scans}
        // الجارية وحدها: من يقف في معرض اليوم لا يسجّل تحت معرض العام
        // الماضي، وقائمة تحوي المنتهية تجعل الخطأ وارداً — وهو خطأ
        // يفسد تقريرين معاً.
        events={runningEvents(events)}
        available={availability.entitled}
        ocrConfigured={availability.ocrConfigured}
        labels={{
          capture: t('scan.capture'),
          captureHint: t('scan.captureHint'),
          manual: t('scan.manual'),
          qr: t('scan.qr'),
          qrHint: t('scan.qrHint'),
          qrRead: t('scan.qrRead'),
          event: t('events.title'),
          noEvent: t('scan.noEvent'),
          kind: t('scan.kind'),
          kinds: {
            business_card: t('scan.kinds.business_card'),
            badge: t('scan.kinds.badge'),
          },
          fullName: t('scan.fields.fullName'),
          email: t('scan.fields.email'),
          phone: t('scan.fields.phone'),
          organizationName: t('scan.fields.organizationName'),
          jobTitle: t('scan.fields.jobTitle'),
          marketingConsent: t('scan.marketingConsent'),
          marketingConsentHint: t('scan.marketingConsentHint'),
          save: t('scan.save'),
          discard: t('scan.discard'),
          processing: t('scan.processing'),
          lowConfidence: t('scan.lowConfidence'),
          saved: t('scan.saved'),
          duplicate: t('scan.duplicate'),
          empty: t('scan.empty'),
          planLimit: t('scan.planLimit'),
          manualOnly: t('scan.manualOnly'),
        }}
      />
    </main>
  );
}
