'use client';

import type { EmployeeImportSummary } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { startImportAction } from './actions';

interface Labels {
  hint: string;
  columns: string;
  file: string;
  createCards: string;
  sendInvites: string;
  submit: string;
  uploading: string;
  planLimit: string;
  history: string;
  invited: string;
  updated: string;
  skipped: string;
  errors: string;
  empty: string;
  statusLabel: Record<string, string>;
}

/**
 * لوحة الاستيراد الجماعي (§9.2).
 *
 * الملف يُقرأ في المتصفح ويُرسل نصاً إلى إجراء خادمي — **لا يُرفع إلى
 * التخزين**. ملف موارد بشرية يحمل بيانات مئة شخص لا داعي لبقاء نسخة
 * منه بعد تنفيذ الدفعة، وأبسط طريقة لضمان ذلك ألا يُخزَّن أصلاً.
 *
 * التاريخ معروض تحت النموذج مباشرةً: الدفعة تعمل في الخلفية، والمسؤول
 * يحتاج مكاناً يعود إليه ليرى نتيجتها.
 */
export function ImportPanel({
  imports,
  available,
  labels,
}: {
  imports: EmployeeImportSummary[];
  available: boolean;
  labels: Labels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!available) {
    return <p className="mt-4 text-sm text-neutral-500">{labels.planLimit}</p>;
  }

  function submit(formData: FormData): void {
    setError(null);

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError(labels.file);
      return;
    }

    const createCards = formData.get('createCards') === 'on';
    const sendInvites = formData.get('sendInvites') === 'on';

    startTransition(async () => {
      const content = await file.text();
      const result = await startImportAction(
        { fileName: file.name, createCards, sendInvites, defaultRole: 'member' },
        content,
      );

      if (!result.ok) {
        setError(result.message ?? null);
      }
    });
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{labels.hint}</p>
      <code className="mt-2 block overflow-x-auto rounded-lg bg-neutral-100 px-3 py-2 text-xs dark:bg-neutral-900">
        {labels.columns}
      </code>

      <form action={submit} className="mt-4 flex flex-wrap items-center gap-4">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          aria-label={labels.file}
          className="text-sm"
        />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sendInvites" defaultChecked className="h-4 w-4" />
          {labels.sendInvites}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="createCards" className="h-4 w-4" />
          {labels.createCards}
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? labels.uploading : labels.submit}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <h3 className="mt-8 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
        {labels.history}
      </h3>

      {imports.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">{labels.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {imports.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1 truncate text-sm font-medium">{entry.fileName}</span>
                <span className="text-xs text-neutral-500">
                  {labels.statusLabel[entry.status] ?? entry.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-neutral-500">
                <span>
                  {labels.invited}: {entry.invitedCount}
                </span>
                <span>
                  {labels.updated}: {entry.updatedCount}
                </span>
                <span>
                  {labels.skipped}: {entry.skippedCount}
                </span>
                {entry.errorCount > 0 ? (
                  <span className="text-red-600 dark:text-red-400">
                    {labels.errors}: {entry.errorCount}
                  </span>
                ) : null}
              </div>

              {/* أرقام الأسطر فقط لا قيمها: الملف بيانات شخصية، وعرض
                  محتوى الصف الفاشل في اللوحة يضاعف أماكن وجوده. */}
              {entry.rowErrors.length > 0 ? (
                <p className="mt-1 font-mono text-[11px] text-neutral-400">
                  {entry.rowErrors
                    .slice(0, 12)
                    .map((rowError) => `#${rowError.row}`)
                    .join(' ')}
                  {entry.rowErrors.length > 12 ? ' …' : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
