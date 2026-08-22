'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert, Button, Field, Checkbox, Textarea } from '@nomiqa/ui';
import { suspendOrganizationAction, unsuspendOrganizationAction } from '../actions';

/**
 * تعليق مؤسسة ورفع التعليق.
 *
 * التعليق يطلب سبباً مكتوباً لا تأكيداً بنقرة: السبب يُحفظ في سجل
 * التدقيق وهو ما سيُقرأ بعد شهر حين يُسأل «لماذا عُلّق هذا الحساب؟».
 * وحجب الصفحات العامة خيار منفصل لأنه أثقل بكثير — يزيل محتوى منشوراً
 * يراه زوّار لا علاقة لهم بالنزاع.
 */
export function OrganizationRowActions({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [blockPublic, setBlockPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitSuspend() {
    setError(null);
    startTransition(async () => {
      const result = await suspendOrganizationAction(organizationId, reason, blockPublic);
      if (!result.ok) {
        setError(result.message ?? t('errors.generic'));
        return;
      }
      setOpen(false);
      setReason('');
      setBlockPublic(false);
      router.refresh();
    });
  }

  function submitUnsuspend() {
    setError(null);
    startTransition(async () => {
      const result = await unsuspendOrganizationAction(organizationId);
      if (!result.ok) {
        setError(result.message ?? t('errors.generic'));
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={submitUnsuspend} disabled={pending}>
          {t('admin.organizations.unsuspend')}
        </Button>
        <Button size="sm" variant="danger" onClick={() => setOpen(true)} disabled={pending}>
          {t('admin.organizations.suspend')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-80 flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3 text-start">
      <p className="text-[0.8125rem] font-medium">
        {t('admin.organizations.suspendTitle', { name: organizationName })}
      </p>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field label={t('admin.organizations.reason')} htmlFor={`reason-${organizationId}`}>
        <Textarea
          id={`reason-${organizationId}`}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('admin.organizations.reasonHint')}
        />
      </Field>

      <Checkbox
        checked={blockPublic}
        onChange={(event) => setBlockPublic(event.target.checked)}
        label={t('admin.organizations.blockPublic')}
      />

      <div className="flex gap-2">
        <Button size="sm" variant="danger" onClick={submitSuspend} disabled={pending || reason.trim().length < 5}>
          {pending ? t('common.saving') : t('admin.organizations.confirmSuspend')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
