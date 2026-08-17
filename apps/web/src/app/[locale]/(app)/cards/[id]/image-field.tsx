'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Icon } from '@nomiqa/ui';
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
      <span className="block text-[0.8125rem] font-medium text-fg">{label}</span>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}

      <div className="mt-2.5 flex flex-col items-start gap-3">
        {shown ? (
          // <img> لا next/image عمداً: المصدر رابط موقّع قصير العمر أو
          // blob محلي، وكلاهما لا يمر بمحسّن الصور ولا يُخزَّن.
          <img src={shown} alt="" className="h-20 w-20 rounded-md object-cover ring-1 ring-line" />
        ) : (
          // مساحة الإفلات فارغة بحدّ متقطّع: تُقرأ كمكان ينتظر ملفاً
          // لا كصورة تعذّر تحميلها.
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-line-strong bg-surface-2 text-faint transition-colors hover:border-accent-line hover:text-accent disabled:opacity-50"
          >
            <Icon name="plus" size={18} />
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? t('common.loading') : t('cards.media.choose')}
          </Button>

          {shown ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setLocalPreview(null);
                onCleared();
              }}
            >
              {t('cards.media.remove')}
            </Button>
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
        <p role="alert" className="mt-2 text-xs text-danger-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
