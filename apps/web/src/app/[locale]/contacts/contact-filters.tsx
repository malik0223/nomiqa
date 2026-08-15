'use client';

import type { ContactFollowUpStatus, TagData } from '@nomiqa/contracts';
import { CONTACT_FOLLOW_UP_STATUSES } from '@nomiqa/contracts';
import { useSearchParams } from 'next/navigation';

const CONTROL_CLASS =
  'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950';

/**
 * شريط التصفية.
 *
 * `<form method="get">` عادي لا حالة ولا `router.push`: الإرسال يكتب
 * المعاملات في الرابط بنفسه، فتعمل التصفية بلا JavaScript، ويبقى
 * الناتج رابطاً قابلاً للمشاركة وللعودة إليه من سجل المتصفح.
 *
 * `useSearchParams` هنا لملء القيم الحالية عند العودة إلى الصفحة فقط —
 * لا لإدارة الحالة.
 */
export function ContactFilters({
  cards,
  tags,
  labels,
}: {
  cards: Array<{ id: string; fullName: string }>;
  tags: TagData[];
  labels: {
    search: string;
    allCards: string;
    allTags: string;
    allStatuses: string;
    duplicatesOnly: string;
    apply: string;
    reset: string;
    statuses: Record<string, string>;
  };
}) {
  const params = useSearchParams();
  const current = (key: string) => params.get(key) ?? '';

  return (
    <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
      <input
        type="search"
        name="search"
        defaultValue={current('search')}
        placeholder={labels.search}
        aria-label={labels.search}
        className={`${CONTROL_CLASS} min-w-48 flex-1`}
      />

      <select
        name="cardId"
        defaultValue={current('cardId')}
        aria-label={labels.allCards}
        className={CONTROL_CLASS}
      >
        <option value="">{labels.allCards}</option>
        {cards.map((card) => (
          <option key={card.id} value={card.id}>
            {card.fullName}
          </option>
        ))}
      </select>

      <select
        name="tagId"
        defaultValue={current('tagId')}
        aria-label={labels.allTags}
        className={CONTROL_CLASS}
      >
        <option value="">{labels.allTags}</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>

      <select
        name="status"
        defaultValue={current('status')}
        aria-label={labels.allStatuses}
        className={CONTROL_CLASS}
      >
        <option value="">{labels.allStatuses}</option>
        {CONTACT_FOLLOW_UP_STATUSES.map((status: ContactFollowUpStatus) => (
          <option key={status} value={status}>
            {labels.statuses[status] ?? status}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 px-1 text-sm">
        <input
          type="checkbox"
          name="duplicates"
          value="only"
          defaultChecked={current('duplicates') === 'only'}
          className="h-4 w-4"
        />
        {labels.duplicatesOnly}
      </label>

      <button
        type="submit"
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        {labels.apply}
      </button>

      {/* رابط لا زر إعادة تعيين: يمسح كل المعاملات دفعة واحدة. */}
      <a href="?" className="px-2 py-2 text-sm text-neutral-500 hover:underline">
        {labels.reset}
      </a>
    </form>
  );
}
