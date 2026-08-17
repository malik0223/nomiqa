'use client';

import type { ContactDetail, ContactFollowUpStatus, TagData } from '@nomiqa/contracts';
import { CONTACT_FOLLOW_UP_STATUSES } from '@nomiqa/contracts';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { formatDateTime } from '@/lib/format';
import {
  addFollowUpAction,
  addNoteAction,
  completeFollowUpAction,
  deleteContactAction,
  removeNoteAction,
  updateContactAction,
} from '../actions';

interface Labels {
  status: string;
  statuses: Record<string, string>;
  tags: string;
  newTag: string;
  notes: string;
  notePlaceholder: string;
  addNote: string;
  removeNote: string;
  followUps: string;
  followUpTitle: string;
  followUpDue: string;
  addFollowUp: string;
  completeFollowUp: string;
  done: string;
  saving: string;
  deleteContact: string;
  deleteConfirm: string;
  error: string;
}

const PANEL = 'mt-4 rounded-card border border-line p-5';
const CONTROL =
  'rounded-lg border border-line bg-white px-3 py-2 text-sm';

/**
 * لوحة العمل على جهة اتصال.
 *
 * مكوّن عميل واحد يجمع كل ما يُعدَّل — الحالة والتصنيفات والملاحظات
 * والتذكيرات — بدل مكوّن لكل قسم: كلها تشترك في حالة «جارٍ الحفظ»
 * وفي رسالة خطأ واحدة، وتفريقها كان سينتج أربع نسخ من المنطق نفسه.
 *
 * كل تعديل يمر بإجراء خادمي ثم `router.refresh()`: الخادم هو مصدر
 * الحقيقة، وتحديث الحالة محلياً بتفاؤل كان سيُظهر تعديلاً رفضه الـAPI.
 */
export function ContactWorkspace({
  contact,
  tags,
  locale,
  labels,
}: {
  contact: ContactDetail;
  tags: TagData[];
  locale: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDue, setFollowUpDue] = useState('');

  const selectedTagIds = new Set(contact.tags.map((tag) => tag.id));

  const run = (work: () => Promise<{ ok: boolean; message?: string }>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.message ?? labels.error);
        return;
      }
      onDone?.();
      router.refresh();
    });
  };

  const toggleTag = (tagId: string) => {
    const next = new Set(selectedTagIds);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);

    run(() => updateContactAction(contact.id, { tagIds: [...next] }));
  };

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <section className={PANEL}>
        <label htmlFor="follow-up-status" className="font-display text-sm font-semibold tracking-tight">
          {labels.status}
        </label>
        <select
          id="follow-up-status"
          value={contact.followUpStatus}
          disabled={pending}
          onChange={(event) =>
            run(() =>
              updateContactAction(contact.id, {
                followUpStatus: event.target.value as ContactFollowUpStatus,
              }),
            )
          }
          className={`${CONTROL} mt-2 block`}
        >
          {CONTACT_FOLLOW_UP_STATUSES.map((status) => (
            <option key={status} value={status}>
              {labels.statuses[status] ?? status}
            </option>
          ))}
        </select>
      </section>

      <section className={PANEL}>
        <h2 className="font-display text-sm font-semibold tracking-tight">{labels.tags}</h2>

        {tags.length === 0 ? (
          <p className="mt-2 text-sm text-faint">{labels.newTag}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => {
              const selected = selectedTagIds.has(tag.id);
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    disabled={pending}
                    aria-pressed={selected}
                    onClick={() => toggleTag(tag.id)}
                    className={
                      selected
                        ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-white'
                        : 'rounded-full border border-line px-3 py-1 text-xs hover:bg-surface-2'
                    }
                  >
                    {tag.name}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={PANEL}>
        <h2 className="font-display text-sm font-semibold tracking-tight">{labels.notes}</h2>

        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={labels.notePlaceholder}
            rows={3}
            className={CONTROL}
          />
          <button
            type="button"
            disabled={pending || note.trim().length === 0}
            onClick={() =>
              run(
                () => addNoteAction(contact.id, note),
                () => setNote(''),
              )
            }
            className="self-start inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg shadow-sheet transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            {pending ? labels.saving : labels.addNote}
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {contact.notes.map((entry) => (
            <li key={entry.id} className="rounded-lg bg-surface-2 p-3 text-sm">
              <p className="whitespace-pre-wrap leading-6">{entry.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-faint">
                <span>{entry.authorName ?? '—'}</span>
                <span>{formatDateTime(entry.createdAt, locale)}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeNoteAction(contact.id, entry.id))}
                  className="text-danger-500 hover:underline"
                >
                  {labels.removeNote}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={PANEL}>
        <h2 className="font-display text-sm font-semibold tracking-tight">{labels.followUps}</h2>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            type="text"
            value={followUpTitle}
            onChange={(event) => setFollowUpTitle(event.target.value)}
            placeholder={labels.followUpTitle}
            aria-label={labels.followUpTitle}
            className={`${CONTROL} min-w-48 flex-1`}
          />
          <input
            type="datetime-local"
            value={followUpDue}
            onChange={(event) => setFollowUpDue(event.target.value)}
            aria-label={labels.followUpDue}
            className={CONTROL}
          />
          <button
            type="button"
            disabled={pending || followUpTitle.trim().length === 0 || followUpDue.length === 0}
            onClick={() =>
              run(
                // الحقل يعطي وقتاً محلياً بلا منطقة زمنية؛ نحوّله إلى
                // ISO بالتوقيت العالمي لأن الـAPI يخزّن UTC دائماً.
                () =>
                  addFollowUpAction(contact.id, followUpTitle, new Date(followUpDue).toISOString()),
                () => {
                  setFollowUpTitle('');
                  setFollowUpDue('');
                },
              )
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg shadow-sheet transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            {labels.addFollowUp}
          </button>
        </div>

        <ul className="mt-4 space-y-2 text-sm">
          {contact.followUps.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className={task.status === 'done' ? 'text-faint line-through' : ''}>
                {task.title}
              </span>
              <span className="flex items-center gap-3 text-xs text-faint">
                <time dateTime={task.dueAt}>{formatDateTime(task.dueAt, locale)}</time>
                {task.status === 'done' ? (
                  <span>{labels.done}</span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => completeFollowUpAction(contact.id, task.id))}
                    className="text-primary hover:underline"
                  >
                    {labels.completeFollowUp}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-danger-100 p-5">
        <DeleteContact
          disabled={pending}
          label={labels.deleteContact}
          confirmLabel={labels.deleteConfirm}
          onDelete={() =>
            run(
              () => deleteContactAction(contact.id),
              () => router.push(`/${locale}/contacts`),
            )
          }
        />
      </section>
    </>
  );
}

/**
 * الحذف بخطوتين.
 *
 * الحذف يخفي بيانات شخص لن يستطيع أن يطلب استرجاعها، فلا يكون على
 * بُعد نقرة واحدة قرب أزرار الاستخدام اليومي.
 */
function DeleteContact({
  disabled,
  label,
  confirmLabel,
  onDelete,
}: {
  disabled: boolean;
  label: string;
  confirmLabel: string;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setArmed(true)}
        className="text-sm font-medium text-danger-500 hover:underline"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={onDelete}
        className="rounded-lg bg-danger-500 px-4 py-2 text-sm font-medium text-white hover:bg-danger-600 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-sm text-faint hover:underline"
      >
        ✕
      </button>
    </div>
  );
}
