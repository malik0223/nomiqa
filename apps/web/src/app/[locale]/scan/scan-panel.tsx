'use client';

import type { EventSummary, LeadQualifier, ScanJobSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import {
  confirmScanAction,
  discardScanAction,
  requestScanUploadAction,
  scanQrAction,
  startScanAction,
} from './actions';

interface Labels {
  capture: string;
  captureHint: string;
  manual: string;
  qr: string;
  qrHint: string;
  qrRead: string;
  event: string;
  noEvent: string;
  kind: string;
  kinds: Record<'business_card' | 'badge', string>;
  fullName: string;
  email: string;
  phone: string;
  organizationName: string;
  jobTitle: string;
  marketingConsent: string;
  marketingConsentHint: string;
  save: string;
  discard: string;
  processing: string;
  lowConfidence: string;
  saved: string;
  duplicate: string;
  empty: string;
  planLimit: string;
  manualOnly: string;
}

/**
 * شاشة المسح (§11.2).
 *
 * الشاشة الوحيدة في المنصة التي تُستخدم **واقفاً**: في قاعة معرض، بيد
 * واحدة، بين محادثتين، على شبكة رديئة. كل قرار فيها يتبع ذلك:
 *
 *  · التصوير مباشرة بكاميرا الجهاز (`capture`) لا اختيار من المعرض.
 *  · الحقول تظهر جاهزة للتعديل فوراً — لا شاشة ثانية ولا تأكيد وسيط.
 *  · الحقل منخفض الثقة يُعلَّم بلون، فتقع العين عليه أولاً.
 *  · «لا محرك مضبوط» ليس خطأً بل نموذج فارغ: الإدخال اليدوي في
 *    المكان نفسه أسرع من فتح البطاقات الورقية بعد أسبوع.
 */
export function ScanPanel({
  scans,
  events,
  available,
  ocrConfigured,
  labels,
}: {
  scans: ScanJobSummary[];
  events: EventSummary[];
  available: boolean;
  ocrConfigured: boolean;
  labels: Labels;
}) {
  const [items, setItems] = useState<ScanJobSummary[]>(scans);
  const [eventId, setEventId] = useState<string>(events[0]?.id ?? '');
  const [kind, setKind] = useState<'business_card' | 'badge'>('business_card');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!available) {
    return <p className="mt-4 text-sm text-neutral-500">{labels.planLimit}</p>;
  }

  async function upload(file: File): Promise<void> {
    setError(null);

    const ticket = await requestScanUploadAction({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });

    if (!ticket.ok || !ticket.uploadUrl || !ticket.fileId) {
      setError(ticket.message ?? null);
      return;
    }

    // الرفع مباشرة إلى التخزين بالرابط الموقّع — لا يمر بخادمنا.
    const uploaded = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });

    if (!uploaded.ok) {
      setError(labels.processing);
      return;
    }

    const started = await startScanAction({
      fileId: ticket.fileId,
      kind,
      eventId: eventId || null,
    });

    if (!started.ok || !started.scan) {
      setError(started.message ?? null);
      return;
    }

    setItems((list) => [started.scan!, ...list]);
  }

  function readQr(payload: string): void {
    setError(null);

    startTransition(async () => {
      const result = await scanQrAction({ payload, eventId: eventId || null });

      if (!result.ok || !result.scan) {
        setError(result.message ?? null);
        return;
      }

      setItems((list) => [result.scan!, ...list]);
    });
  }

  function save(scan: ScanJobSummary, values: Record<string, string>, marketing: boolean): void {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await confirmScanAction(scan.id, {
        fullName: values.fullName ?? '',
        email: values.email || null,
        phone: values.phone || null,
        organizationName: values.organizationName || null,
        jobTitle: values.jobTitle || null,
        eventId: scan.eventId ?? (eventId || null),
        // البادئة `q:` تفصل حقول التأهيل عن حقول جهة الاتصال داخل
        // النموذج الواحد، وتُنزع قبل الإرسال: المفتاح في قاعدة
        // البيانات هو ما عرّفه منظّم الفعالية لا ما زادته الواجهة.
        qualifiers: Object.fromEntries(
          Object.entries(values)
            .filter(([key, value]) => key.startsWith('q:') && value.length > 0)
            .map(([key, value]) => [key.slice(2), value]),
        ),
        marketingConsent: marketing,
      });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      setItems((list) => list.filter((item) => item.id !== scan.id));
      setNotice(result.isDuplicate ? labels.duplicate : labels.saved);
    });
  }

  function discard(scanId: string): void {
    setError(null);

    startTransition(async () => {
      const result = await discardScanAction(scanId);

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      setItems((list) => list.filter((item) => item.id !== scanId));
    });
  }

  return (
    <div className="mt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{labels.event}</span>
          <select
            value={eventId}
            onChange={(changed) => setEventId(changed.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">{labels.noEvent}</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{labels.kind}</span>
          <select
            value={kind}
            onChange={(changed) => setKind(changed.target.value as 'business_card' | 'badge')}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="business_card">{labels.kinds.business_card}</option>
            <option value="badge">{labels.kinds.badge}</option>
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
        <label className="block text-sm font-medium">{labels.capture}</label>
        <input
          type="file"
          accept="image/*"
          // `environment` يفتح الكاميرا الخلفية مباشرة على الهاتف.
          capture="environment"
          onChange={(changed) => {
            const file = changed.target.files?.[0];
            if (file) void upload(file);
            changed.target.value = '';
          }}
          className="mt-2 block w-full text-sm"
        />
        <p className="mt-2 text-xs text-neutral-500">
          {ocrConfigured ? labels.captureHint : labels.manualOnly}
        </p>
      </div>

      <form
        className="mt-4 flex gap-2"
        action={(formData) => {
          const payload = String(formData.get('payload') ?? '').trim();
          if (payload) readQr(payload);
        }}
      >
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{labels.qr}</span>
          <input
            name="payload"
            dir="ltr"
            placeholder={labels.qrHint}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-6 h-10 rounded-lg bg-neutral-100 px-3 text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
        >
          {labels.qrRead}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-emerald-600">{notice}</p> : null}

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">{labels.empty}</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {items.map((scan) => (
            <ScanCard
              key={scan.id}
              scan={scan}
              qualifiers={events.find((event) => event.id === (scan.eventId ?? eventId))?.qualifiers ?? []}
              labels={labels}
              pending={pending}
              onSave={(values, marketing) => save(scan, values, marketing)}
              onDiscard={() => discard(scan.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** الحد الذي يُعلَّم تحته الحقل ليراجَع أولاً. */
const LOW_CONFIDENCE = 0.6;

function ScanCard({
  scan,
  qualifiers,
  labels,
  pending,
  onSave,
  onDiscard,
}: {
  scan: ScanJobSummary;
  qualifiers: LeadQualifier[];
  labels: Labels;
  pending: boolean;
  onSave: (values: Record<string, string>, marketing: boolean) => void;
  onDiscard: () => void;
}) {
  const extracted = scan.extracted;

  if (scan.status === 'pending' || scan.status === 'processing') {
    return (
      <li className="rounded-xl border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
        {labels.processing}
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      {scan.error ? <p className="mb-3 text-xs text-amber-600">{scan.error}</p> : null}

      <form
        className="grid gap-3 sm:grid-cols-2"
        action={(formData) => {
          const values: Record<string, string> = {};
          for (const [key, value] of formData.entries()) {
            if (key !== 'marketingConsent') values[key] = String(value);
          }
          onSave(values, formData.get('marketingConsent') === 'on');
        }}
      >
        <ExtractedField
          name="fullName"
          label={labels.fullName}
          value={extracted.fullName?.value ?? ''}
          confidence={extracted.fullName?.confidence}
          required
          lowLabel={labels.lowConfidence}
        />
        <ExtractedField
          name="jobTitle"
          label={labels.jobTitle}
          value={extracted.jobTitle?.value ?? ''}
          confidence={extracted.jobTitle?.confidence}
          lowLabel={labels.lowConfidence}
        />
        <ExtractedField
          name="organizationName"
          label={labels.organizationName}
          value={extracted.organizationName?.value ?? ''}
          confidence={extracted.organizationName?.confidence}
          lowLabel={labels.lowConfidence}
        />
        <ExtractedField
          name="email"
          label={labels.email}
          value={extracted.email?.value ?? ''}
          confidence={extracted.email?.confidence}
          dir="ltr"
          lowLabel={labels.lowConfidence}
        />
        <ExtractedField
          name="phone"
          label={labels.phone}
          value={extracted.phone?.value ?? ''}
          confidence={extracted.phone?.confidence}
          dir="ltr"
          lowLabel={labels.lowConfidence}
        />

        {qualifiers.map((field) => (
          <label key={field.key} className="text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{field.label}</span>
            {field.type === 'select' ? (
              <select
                name={`q:${field.key}`}
                required={field.required}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="">—</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={`q:${field.key}`}
                required={field.required}
                maxLength={200}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              />
            )}
          </label>
        ))}

        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="marketingConsent" className="mt-1" />
          <span>
            {labels.marketingConsent}
            <span className="mt-0.5 block text-xs text-neutral-500">
              {labels.marketingConsentHint}
            </span>
          </span>
        </label>

        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {labels.save}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
          >
            {labels.discard}
          </button>
        </div>
      </form>
    </li>
  );
}

function ExtractedField({
  name,
  label,
  value,
  confidence,
  required = false,
  dir,
  lowLabel,
}: {
  name: string;
  label: string;
  value: string;
  confidence?: number;
  required?: boolean;
  dir?: 'ltr';
  lowLabel: string;
}) {
  const low = value.length > 0 && confidence !== undefined && confidence < LOW_CONFIDENCE;

  return (
    <label className="text-sm">
      <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{label}</span>
      <input
        name={name}
        defaultValue={value}
        required={required}
        dir={dir}
        maxLength={120}
        className={
          low
            ? 'w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 dark:border-amber-600 dark:bg-amber-950'
            : 'w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900'
        }
      />
      {low ? <span className="mt-1 block text-xs text-amber-600">{lowLabel}</span> : null}
    </label>
  );
}
