'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { filePurposeRules, type FilePurpose } from '@nomiqa/validation';
import { confirmUploadAction, requestUploadAction } from '../actions';

/**
 * رفع صورة.
 *
 * المسار: طلب رابط موقّع من الخادم ← رفع **مباشر** من المتصفح إلى
 * التخزين ← تأكيد. الملف لا يمر عبر الويب ولا الـAPI إطلاقاً (§8)،
 * فلا يستهلك ذاكرة الخادم ولا يحدّه سقف حجم الطلب.
 */
export function ImageField({
  purpose,
  label,
  hint,
  previewUrl,
  onUploaded,
  onCleared,
}: {
  purpose: Extract<FilePurpose, 'avatar' | 'cover' | 'logo'>;
  label: string;
  hint?: string;
  previewUrl: string | null;
  onUploaded: (fileId: string, objectUrl: string) => void;
  onCleared: () => void;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const rules = filePurposeRules[purpose];
  const shown = localPreview ?? previewUrl;

  async function upload(file: File) {
    setError(null);

    // فحص المتصفح للتجربة فقط: الـAPI يعيد الفحص، ثم يتحقق من الحجم
    // الحقيقي في التخزين بعد الرفع — فالمعلن قد يخالف المرفوع.
    if (!rules.mimeTypes.includes(file.type)) {
      setError(t('cards.media.badType'));
      return;
    }
    if (file.size > rules.maxBytes) {
      setError(t('cards.media.tooLarge', { mb: Math.round(rules.maxBytes / 1024 / 1024) }));
      return;
    }

    setBusy(true);
    try {
      const ticket = await requestUploadAction({
        purpose,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      if (!ticket.ok) {
        setError(ticket.message ?? t('errors.generic'));
        return;
      }

      const response = await fetch(ticket.ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });

      if (!response.ok) {
        setError(t('cards.media.uploadFailed'));
        return;
      }

      const confirmed = await confirmUploadAction(ticket.ticket.fileId);
      if (!confirmed.ok) {
        setError(confirmed.message ?? t('cards.media.uploadFailed'));
        return;
      }

      // معاينة محلية فورية: رابط التنزيل الموقّع لا يصل إلا بعد الحفظ
      // التالي، وانتظاره يجعل الرفع يبدو وكأنه لم يحدث.
      const objectUrl = URL.createObjectURL(file);
      setLocalPreview(objectUrl);
      onUploaded(ticket.ticket.fileId, objectUrl);
    } catch {
      setError(t('cards.media.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="block text-sm font-medium">{label}</span>
      {hint ? <p className="mt-0.5 text-xs text-neutral-500">{hint}</p> : null}

      <div className="mt-2 flex items-center gap-3">
        {shown ? (
          // <img> لا next/image عمداً: المصدر رابط موقّع قصير العمر أو
          // blob محلي، وكلاهما لا يمر بمحسّن الصور ولا يُخزَّن.
          <img
            src={shown}
            alt=""
            className="h-16 w-16 rounded-lg object-cover ring-1 ring-neutral-200 dark:ring-neutral-800"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-neutral-100 text-xs text-neutral-400 dark:bg-neutral-800">
            —
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {busy ? t('common.loading') : t('cards.media.choose')}
          </button>

          {shown ? (
            <button
              type="button"
              onClick={() => {
                setLocalPreview(null);
                onCleared();
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              {t('cards.media.remove')}
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={rules.mimeTypes.join(',')}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // تفريغ القيمة يسمح بإعادة اختيار الملف نفسه بعد الحذف.
          event.target.value = '';
          if (file) void upload(file);
        }}
      />

      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
