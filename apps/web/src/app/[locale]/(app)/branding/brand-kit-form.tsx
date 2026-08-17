'use client';

import type { BrandKitPayload } from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { updateBrandKitAction } from './actions';

interface Labels {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  backgroundColor: string;
  fontFamily: string;
  hideBadge: string;
  hideBadgeLocked: string;
  save: string;
  saving: string;
  saved: string;
  planLimit: string;
}

const COLOR_FIELDS = [
  ['primaryColor', 'primaryColor'],
  ['secondaryColor', 'secondaryColor'],
  ['textColor', 'textColor'],
  ['backgroundColor', 'backgroundColor'],
] as const;

/**
 * ألوان المؤسسة وخطها.
 *
 * `hidePlatformBadge` يُعرض معطّلاً مع سببه حين لا تسمح الباقة، لا
 * مخفياً: القيمة المحفوظة تبقى كما هي، وترقية الباقة تفعّلها بلا
 * إعادة ضبط — وهذا ما يشرحه النص للمسؤول.
 */
export function BrandKitForm({
  kit,
  available,
  labels,
}: {
  kit: BrandKitPayload;
  available: boolean;
  labels: Labels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!available) {
    return <p className="mt-4 text-sm text-faint">{labels.planLimit}</p>;
  }

  function submit(formData: FormData): void {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateBrandKitAction({
        primaryColor: emptyToNull(formData.get('primaryColor')),
        secondaryColor: emptyToNull(formData.get('secondaryColor')),
        textColor: emptyToNull(formData.get('textColor')),
        backgroundColor: emptyToNull(formData.get('backgroundColor')),
        fontFamily: emptyToNull(formData.get('fontFamily')),
        hidePlatformBadge: formData.get('hidePlatformBadge') === 'on',
      });

      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }

      setSaved(true);
    });
  }

  return (
    <form action={submit} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {COLOR_FIELDS.map(([name, labelKey]) => (
          <label key={name} className="block text-sm">
            <span className="font-medium">{labels[labelKey]}</span>
            <input
              type="color"
              name={name}
              defaultValue={kit[name] ?? '#0f766e'}
              className="mt-1 h-10 w-full rounded-lg border border-line"
            />
          </label>
        ))}
      </div>

      <label className="block text-sm">
        <span className="font-medium">{labels.fontFamily}</span>
        <input
          type="text"
          name="fontFamily"
          defaultValue={kit.fontFamily ?? ''}
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
        />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="hidePlatformBadge"
          defaultChecked={kit.hidePlatformBadge}
          disabled={!kit.hidePlatformBadgeAllowed}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          {labels.hideBadge}
          {!kit.hidePlatformBadgeAllowed ? (
            <span className="mt-0.5 block text-xs text-faint">{labels.hideBadgeLocked}</span>
          ) : null}
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-sm text-danger-500">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? labels.saving : labels.save}
        </button>
        {saved ? <span className="text-sm text-primary">{labels.saved}</span> : null}
      </div>
    </form>
  );
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}
