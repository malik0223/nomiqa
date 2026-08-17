'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { exportDataAction, requestDeletionAction } from './actions';

export function DangerZone() {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const CONFIRM_WORD = t('settings.delete.confirmWord');

  function download() {
    setMessage(null);
    startTransition(async () => {
      const result = await exportDataAction();
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.message ?? t('errors.generic') });
        return;
      }

      // التنزيل يتم في المتصفح من بيانات وصلت عبر الخادم؛ الرمز لم
      // يغادر الخادم في أي لحظة.
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nomiqa-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function requestDeletion() {
    setMessage(null);
    startTransition(async () => {
      const result = await requestDeletionAction();
      if (result.ok) {
        // الجلسة لم تعد صالحة: الحساب موسوم محذوفاً والعضويات ملغاة.
        window.location.href = '/auth/logout';
        return;
      }
      setMessage({ kind: 'error', text: result.message ?? t('errors.generic') });
    });
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="rounded-lg border border-line p-4">
        <p className="text-sm font-medium">{t('settings.export.title')}</p>
        <p className="mt-1 text-xs text-faint">{t('settings.export.description')}</p>
        <button
          type="button"
          onClick={download}
          disabled={pending}
          className="mt-3 rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-3 disabled:opacity-50"
        >
          {t('settings.export.action')}
        </button>
      </div>

      <div className="rounded-lg border border-danger-100 p-4">
        <p className="text-sm font-medium text-danger-900">
          {t('settings.delete.title')}
        </p>
        <p className="mt-1 text-xs text-red-800">
          {t('settings.delete.description')}
        </p>

        {/* تأكيد بالكتابة لا بنقرة: العملية لا رجعة فيها، والنقرة
            وحدها تُضغط بالخطأ. */}
        <label htmlFor="confirm" className="mt-3 block text-xs text-red-800">
          {t('settings.delete.confirmLabel', { word: CONFIRM_WORD })}
        </label>
        <input
          id="confirm"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          className="mt-1 w-full rounded-lg border border-danger-100 px-3 py-2"
        />

        <button
          type="button"
          onClick={requestDeletion}
          disabled={pending || confirmText.trim() !== CONFIRM_WORD}
          className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-40"
        >
          {t('settings.delete.action')}
        </button>
      </div>

      {message ? (
        <p
          role="alert"
          className={
            message.kind === 'ok'
              ? 'text-sm text-success-600 dark:text-green-400'
              : 'text-sm text-danger-600'
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
