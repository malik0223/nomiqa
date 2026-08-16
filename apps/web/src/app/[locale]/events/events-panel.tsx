'use client';

import type { CardSummary, EventSummary, LeadQualifierType } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { createEventAction, deleteEventAction } from './actions';

interface Labels {
  name: string;
  location: string;
  startsAt: string;
  endsAt: string;
  cards: string;
  cardsHint: string;
  qualifiers: string;
  qualifiersHint: string;
  addQualifier: string;
  removeQualifier: string;
  qualifierLabel: string;
  qualifierType: string;
  qualifierOptions: string;
  qualifierOptionsHint: string;
  cost: string;
  costHint: string;
  target: string;
  create: string;
  report: string;
  delete: string;
  deleteConfirm: string;
  leads: string;
  empty: string;
  planLimit: string;
  noPublishedCards: string;
  types: Record<LeadQualifierType, string>;
  status: Record<EventSummary['status'], string>;
}

interface QualifierDraft {
  id: number;
  label: string;
  type: LeadQualifierType;
  options: string;
}

/**
 * إدارة الفعاليات (§11.3).
 *
 * حقول التأهيل تُعرَّف هنا لا في شاشة المسح: تعريفها قرار يُتخذ قبل
 * المعرض بأسبوع مع من يقرأ التقرير، وتركه للمندوب في القاعة كان يعني
 * حقولاً مختلفة لكل عضو — أي تقريراً بلا أعمدة مشتركة.
 */
export function EventsPanel({
  events,
  cards,
  available,
  locale,
  labels,
}: {
  events: EventSummary[];
  cards: CardSummary[];
  available: boolean;
  locale: string;
  labels: Labels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [qualifiers, setQualifiers] = useState<QualifierDraft[]>([]);
  const [pending, startTransition] = useTransition();

  if (!available) {
    return <p className="mt-4 text-sm text-neutral-500">{labels.planLimit}</p>;
  }

  function create(formData: FormData): void {
    setError(null);

    startTransition(async () => {
      const startsAt = String(formData.get('startsAt') ?? '');
      const endsAt = String(formData.get('endsAt') ?? '');
      const cost = String(formData.get('costOmr') ?? '').trim();
      const target = String(formData.get('targetLeads') ?? '').trim();

      const result = await createEventAction({
        name: String(formData.get('name') ?? ''),
        location: String(formData.get('location') ?? '') || null,
        // نفس معالجة الحملات: `datetime-local` بلا منطقة زمنية، وتفسيره
        // UTC كان يزيح نافذة كل فعالية عُمانية أربع ساعات — أي يُسقط
        // ساعات الصباح الأولى من الإسناد.
        startsAt: startsAt ? new Date(startsAt).toISOString() : '',
        endsAt: endsAt ? new Date(endsAt).toISOString() : '',
        cardIds: formData.getAll('cardIds').map(String),
        qualifiers: qualifiers
          .filter((field) => field.label.trim().length > 0)
          .map((field) => ({
            key: slugify(field.label),
            label: field.label.trim(),
            labelEn: null,
            type: field.type,
            options:
              field.type === 'select'
                ? field.options
                    .split(',')
                    .map((option) => option.trim())
                    .filter(Boolean)
                : [],
            required: false,
          })),
        // المبلغ يُدخل بالريال ويُخزَّن بالبيسة: كل مبالغ المنصة أعداد
        // صحيحة، ولا رقم عشري يعبر أي حد.
        costBaisa: cost ? Math.round(Number(cost) * 1000) : null,
        targetLeads: target ? Number(target) : null,
      });

      if (result.ok) {
        setQualifiers([]);
      } else {
        setError(result.message ?? null);
      }
    });
  }

  function remove(id: string): void {
    if (!globalThis.confirm(labels.deleteConfirm)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteEventAction(id);
      if (!result.ok) setError(result.message ?? null);
    });
  }

  return (
    <div className="mt-4">
      <form action={create} className="grid gap-3 sm:grid-cols-2">
        <Field name="name" label={labels.name} required maxLength={120} />
        <Field name="location" label={labels.location} maxLength={160} />
        <Field name="startsAt" label={labels.startsAt} type="datetime-local" required />
        <Field name="endsAt" label={labels.endsAt} type="datetime-local" required />

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{labels.cards}</span>
          <select
            name="cardIds"
            multiple
            size={Math.min(4, Math.max(2, cards.length))}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.fullName}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">{labels.cardsHint}</span>
        </label>

        <Field name="costOmr" label={labels.cost} type="number" step="0.001" hint={labels.costHint} />
        <Field name="targetLeads" label={labels.target} type="number" step="1" />

        <div className="sm:col-span-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{labels.qualifiers}</p>
          <p className="mt-0.5 text-xs text-neutral-500">{labels.qualifiersHint}</p>

          <div className="mt-2 space-y-2">
            {qualifiers.map((field, index) => (
              <div key={field.id} className="grid gap-2 sm:grid-cols-[1fr_140px_1fr_auto]">
                <input
                  value={field.label}
                  onChange={(changed) => update(index, { label: changed.target.value })}
                  placeholder={labels.qualifierLabel}
                  maxLength={60}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                />
                <select
                  value={field.type}
                  onChange={(changed) =>
                    update(index, { type: changed.target.value as LeadQualifierType })
                  }
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  {(['select', 'text', 'boolean'] as const).map((type) => (
                    <option key={type} value={type}>
                      {labels.types[type]}
                    </option>
                  ))}
                </select>
                <input
                  value={field.options}
                  onChange={(changed) => update(index, { options: changed.target.value })}
                  placeholder={labels.qualifierOptionsHint}
                  disabled={field.type !== 'select'}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                />
                <button
                  type="button"
                  onClick={() => setQualifiers((list) => list.filter((_, at) => at !== index))}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  {labels.removeQualifier}
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setQualifiers((list) =>
                // ستة حدّ المخطط في الخادم. النموذج يُملأ واقفاً بين
                // محادثتين، وكل حقل إضافي يخفض احتمال ملء الحقول كلها.
                list.length >= 6
                  ? list
                  : [...list, { id: Date.now(), label: '', type: 'select', options: '' }],
              )
            }
            className="mt-2 rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {labels.addQualifier}
          </button>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending || cards.length === 0}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {labels.create}
          </button>
        </div>
      </form>

      {cards.length === 0 ? (
        <p className="mt-2 text-xs text-amber-600">{labels.noPublishedCards}</p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {events.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">{labels.empty}</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{event.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {formatRange(event.startsAt, event.endsAt, locale)}
                    {event.location ? ` — ${event.location}` : ''}
                  </p>
                </div>

                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-800">
                  {labels.status[event.status]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <span className="text-neutral-500">
                  {labels.leads}: <strong className="text-inherit">{event.leadCount}</strong>
                </span>

                <a
                  href={`/${locale}/events/${event.id}`}
                  className="rounded-lg bg-neutral-100 px-2.5 py-1 font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  {labels.report}
                </a>

                <button
                  type="button"
                  onClick={() => remove(event.id)}
                  disabled={pending}
                  className="rounded-lg px-2.5 py-1 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                >
                  {labels.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  function update(index: number, patch: Partial<QualifierDraft>): void {
    setQualifiers((list) =>
      list.map((field, at) => (at === index ? { ...field, ...patch } : field)),
    );
  }
}

/**
 * يشتق مفتاح الحقل من تسميته.
 *
 * التسمية عربية غالباً والمفتاح يجب أن يكون لاتينياً: هو عمود في كل
 * تصدير ومفتاح في كل حمولة Webhook. ما لا يُشتق منه شيء يسقط إلى
 * مفتاح مرقّم — والخادم يرفض ما لا يطابق الشكل على أي حال.
 */
function slugify(label: string): string {
  const ascii = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return /^[a-z]/.test(ascii) ? ascii.slice(0, 32) : `field_${hash(label)}`;
}

function hash(value: string): string {
  let total = 0;
  for (const character of value) {
    total = (total * 31 + character.codePointAt(0)!) % 100_000;
  }
  return String(total);
}

function formatRange(startsAt: string, endsAt: string, locale: string): string {
  const format = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-OM', {
    dateStyle: 'medium',
  });

  return `${format.format(new Date(startsAt))} — ${format.format(new Date(endsAt))}`;
}

function Field({
  name,
  label,
  type = 'text',
  required = false,
  maxLength,
  step,
  hint,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  step?: string;
  hint?: string;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-neutral-600 dark:text-neutral-400">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        step={step}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}
