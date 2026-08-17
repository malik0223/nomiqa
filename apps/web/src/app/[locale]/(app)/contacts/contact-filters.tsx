'use client';

import type { ContactFollowUpStatus, TagData } from '@nomiqa/contracts';
import { CONTACT_FOLLOW_UP_STATUSES } from '@nomiqa/contracts';
import { Button, Icon, Input, Panel, Select } from '@nomiqa/ui';
import { useSearchParams } from 'next/navigation';

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
    <Panel bare className="p-4">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute inset-y-0 start-3 my-auto text-faint"
          />
          <Input
            type="search"
            name="search"
            defaultValue={current('search')}
            placeholder={labels.search}
            aria-label={labels.search}
            className="ps-9"
          />
        </div>

        <Select
          name="cardId"
          defaultValue={current('cardId')}
          aria-label={labels.allCards}
          className="w-auto min-w-36"
        >
          <option value="">{labels.allCards}</option>
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.fullName}
            </option>
          ))}
        </Select>

        <Select
          name="tagId"
          defaultValue={current('tagId')}
          aria-label={labels.allTags}
          className="w-auto min-w-32"
        >
          <option value="">{labels.allTags}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>

        <Select
          name="status"
          defaultValue={current('status')}
          aria-label={labels.allStatuses}
          className="w-auto min-w-32"
        >
          <option value="">{labels.allStatuses}</option>
          {CONTACT_FOLLOW_UP_STATUSES.map((status: ContactFollowUpStatus) => (
            <option key={status} value={status}>
              {labels.statuses[status] ?? status}
            </option>
          ))}
        </Select>

        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-[0.8125rem] text-muted transition-colors hover:border-line-strong has-checked:border-accent-line/60 has-checked:text-fg">
          <input
            type="checkbox"
            name="duplicates"
            value="only"
            defaultChecked={current('duplicates') === 'only'}
            className="h-4 w-4 accent-primary"
          />
          {labels.duplicatesOnly}
        </label>

        <Button type="submit" variant="primary" icon="filter">
          {labels.apply}
        </Button>

        {/* رابط لا زر إعادة تعيين: يمسح كل المعاملات دفعة واحدة. */}
        <a href="?" className="px-2 text-[0.8125rem] text-muted transition-colors hover:text-fg">
          {labels.reset}
        </a>
      </form>
    </Panel>
  );
}
