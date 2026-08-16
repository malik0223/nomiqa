'use client';

import type { SignaturePayload, SignatureTemplateKey } from '@nomiqa/contracts';
import { SIGNATURE_TEMPLATES } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { saveSignatureAction } from './actions';

interface Labels {
  template: string;
  showQr: string;
  showAvatar: string;
  showLogo: string;
  showSocialLinks: string;
  accentColor: string;
  disclaimer: string;
  save: string;
  saving: string;
  saved: string;
  preview: string;
  copyHtml: string;
  copyText: string;
  copied: string;
  enforced: string;
  instructions: string;
  clients: Record<string, string>;
  clientSteps: Record<string, string>;
  templateNames: Record<string, string>;
}

/**
 * مولّد توقيع البريد (§10.3).
 *
 * المعاينة تعرض HTML الناتج كما هو داخل `iframe` معزول، لا نسخة
 * «تقريبية» مبنية بمكوّنات React: التوقيع سيُلصق في محرر بريد بلا CSS
 * حديث، ومعاينة أجمل من الواقع تخفي بالضبط ما يجب أن يُرى.
 *
 * ولذلك أيضاً `sandbox` بلا صلاحيات: المحتوى يحمل نصاً كتبه المستخدم،
 * ومعاينته بلا عزل تجعل الشاشة تنفّذ ما فيه.
 */
export function SignatureStudio({
  initial,
  labels,
}: {
  initial: SignaturePayload;
  labels: Labels;
}) {
  const [signature, setSignature] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'html' | 'text' | null>(null);
  const [pending, startTransition] = useTransition();

  const options = signature.options;

  function save(next: {
    templateKey?: SignatureTemplateKey;
    options?: Partial<SignaturePayload['options']>;
  }): void {
    setError(null);

    startTransition(async () => {
      const result = await saveSignatureAction({
        cardId: signature.cardId,
        templateKey: next.templateKey ?? signature.templateKey,
        options: { ...options, ...next.options },
      });

      if (result.ok && result.signature) setSignature(result.signature);
      else setError(result.message ?? null);
    });
  }

  async function copy(kind: 'html' | 'text'): Promise<void> {
    await navigator.clipboard.writeText(kind === 'html' ? signature.html : signature.text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
      <div>
        {signature.enforced ? (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {labels.enforced}
          </p>
        ) : null}

        <fieldset disabled={signature.enforced || pending} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              {labels.template}
            </span>
            <select
              value={signature.templateKey}
              onChange={(event) =>
                save({ templateKey: event.target.value as SignatureTemplateKey })
              }
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {SIGNATURE_TEMPLATES.map((key) => (
                <option key={key} value={key}>
                  {labels.templateNames[key] ?? key}
                </option>
              ))}
            </select>
          </label>

          <Toggle
            label={labels.showQr}
            checked={options.showQr}
            onChange={(showQr) => save({ options: { showQr } })}
          />
          <Toggle
            label={labels.showAvatar}
            checked={options.showAvatar}
            onChange={(showAvatar) => save({ options: { showAvatar } })}
          />
          <Toggle
            label={labels.showLogo}
            checked={options.showLogo}
            onChange={(showLogo) => save({ options: { showLogo } })}
          />
          <Toggle
            label={labels.showSocialLinks}
            checked={options.showSocialLinks}
            onChange={(showSocialLinks) => save({ options: { showSocialLinks } })}
          />

          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              {labels.accentColor}
            </span>
            <input
              type="color"
              value={options.accentColor ?? '#0f766e'}
              onChange={(event) => save({ options: { accentColor: event.target.value } })}
              className="h-9 w-16 rounded border border-neutral-300 dark:border-neutral-700"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600 dark:text-neutral-400">
              {labels.disclaimer}
            </span>
            <textarea
              defaultValue={options.disclaimer ?? ''}
              maxLength={400}
              rows={3}
              onBlur={(event) =>
                save({ options: { disclaimer: event.target.value.trim() || null } })
              }
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
        </fieldset>

        <p className="mt-3 text-xs text-neutral-500">
          {pending ? labels.saving : labels.saved}
        </p>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      <div>
        <h2 className="text-sm font-semibold">{labels.preview}</h2>

        {/*
          `srcDoc` لا `src`: المحتوى مولَّد ولا يوجد على أي مسار. و
          `sandbox` فارغ يمنع كل شيء — بما فيه الوصول إلى الصفحة الأم.
        */}
        <iframe
          title={labels.preview}
          srcDoc={signature.html}
          sandbox=""
          className="mt-3 h-52 w-full rounded-xl border border-neutral-200 bg-white dark:border-neutral-800"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copy('html')}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            {copied === 'html' ? labels.copied : labels.copyHtml}
          </button>

          <button
            type="button"
            onClick={() => void copy('text')}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {copied === 'text' ? labels.copied : labels.copyText}
          </button>
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-semibold">{labels.instructions}</h2>
          <dl className="mt-3 space-y-3 text-sm">
            {Object.entries(labels.clients).map(([client, name]) => (
              <div key={client}>
                <dt className="font-medium">{name}</dt>
                <dd className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                  {labels.clientSteps[client]}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
