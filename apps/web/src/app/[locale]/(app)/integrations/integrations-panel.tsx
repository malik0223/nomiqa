'use client';

import {
  API_KEY_SCOPES,
  CRM_SYNCABLE_FIELDS,
  HUBSPOT_DEFAULT_FIELD_MAP,
  WEBHOOK_EVENT_TYPES,
  type ApiKeySummary,
  type CrmConnectionSummary,
  type WebhookEndpointSummary,
} from '@nomiqa/contracts';
import { useState, useTransition } from 'react';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  createApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
  disconnectCrmAction,
  revokeApiKeyAction,
  saveCrmConnectionAction,
  syncCrmAction,
} from './actions';

interface Labels {
  keys: string;
  keysIntro: string;
  keyName: string;
  scopes: string;
  issue: string;
  revoke: string;
  revokeConfirm: string;
  lastUsed: string;
  never: string;
  revoked: string;
  secretOnce: string;
  copy: string;
  copied: string;
  webhooks: string;
  webhooksIntro: string;
  url: string;
  events: string;
  add: string;
  delete: string;
  deleteConfirm: string;
  disabled: string;
  failures: string;
  crm: string;
  crmIntro: string;
  accessToken: string;
  accessTokenHint: string;
  fieldMap: string;
  ownerStrategy: string;
  ownerRef: string;
  marketingOnly: string;
  marketingOnlyHint: string;
  connect: string;
  disconnect: string;
  syncAll: string;
  pending: string;
  failed: string;
  lastSync: string;
  logs: string;
  empty: string;
  planLimit: string;
  strategies: Record<'capturer' | 'fixed' | 'unassigned', string>;
}

/**
 * شاشة التكاملات (§11.4 و§11.5).
 *
 * ثلاثة أقسام في صفحة واحدة لأنها إجابة واحدة على سؤال واحد: **كيف
 * تغادر بيانات المؤسسة إلى نظام آخر؟** من يفتح هذه الصفحة يحتاج أن
 * يرى القنوات كلها معاً — مفتاحٌ نُسي مفتوحاً ووجهةٌ تعمل ووصلة
 * تُصدّر يومياً — لا أن يزور ثلاث شاشات ليجمع الصورة.
 */
export function IntegrationsPanel({
  apiKeys,
  webhooks,
  connections,
  features,
  locale,
  labels,
}: {
  apiKeys: ApiKeySummary[];
  webhooks: WebhookEndpointSummary[];
  connections: CrmConnectionSummary[];
  features: { publicApi: boolean; webhooks: boolean; crmSync: boolean };
  locale: string;
  labels: Labels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [issuedSecret, setIssuedSecret] = useState<{ label: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-8 space-y-12">
      {issuedSecret ? (
        <div className="rounded-xl border border-warning-100 bg-warning-50 p-4 dark:border-amber-700">
          <p className="text-sm font-medium">{issuedSecret.label}</p>
          <p className="mt-1 text-xs text-warning-600 dark:text-amber-300">{labels.secretOnce}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1 text-xs" dir="ltr">
              {issuedSecret.value}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(issuedSecret.value);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-surface-3"
            >
              {copied ? labels.copied : labels.copy}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger-500">{error}</p> : null}

      {/* ---------- مفاتيح الـAPI ---------- */}
      <section>
        <h2 className="font-display text-base font-semibold tracking-tight">{labels.keys}</h2>
        <p className="mt-1 text-sm text-muted">{labels.keysIntro}</p>

        {features.publicApi ? (
          <>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  const result = await createApiKeyAction({
                    name: String(formData.get('name') ?? ''),
                    scopes: formData.getAll('scopes').map(String),
                    expiresAt: null,
                  });

                  if (!result.ok || !result.key) {
                    setError(result.message ?? null);
                    return;
                  }

                  setIssuedSecret({ label: result.key.name, value: result.key.token });
                });
              }}
            >
              <label className="text-sm">
                <span className="mb-1 block text-muted">
                  {labels.keyName}
                </span>
                <input
                  name="name"
                  required
                  maxLength={80}
                  className="w-full rounded-lg border border-line px-3 py-2"
                />
              </label>

              <fieldset className="text-sm">
                <legend className="mb-1 text-muted">
                  {labels.scopes}
                </legend>
                <div className="flex flex-wrap gap-3">
                  {API_KEY_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="scopes" value={scope} />
                      <code dir="ltr">{scope}</code>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg shadow-sheet transition-colors hover:bg-primary-hover disabled:opacity-45"
                >
                  {labels.issue}
                </button>
              </div>
            </form>

            <ul className="mt-6 space-y-2">
              {apiKeys.length === 0 ? (
                <li className="text-sm text-faint">{labels.empty}</li>
              ) : (
                apiKeys.map((key) => (
                  <li
                    key={key.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{key.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-faint" dir="ltr">
                        nmq_{key.prefix}_… · {key.scopes.join(' ')}
                      </p>
                      <p className="mt-0.5 text-xs text-faint">
                        {labels.lastUsed}:{' '}
                        {key.lastUsedAt
                          ? formatDate(key.lastUsedAt, locale)
                          : labels.never}
                      </p>
                    </div>

                    {key.revokedAt ? (
                      <span className="text-xs text-faint">{labels.revoked}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (!globalThis.confirm(labels.revokeConfirm)) return;
                          setError(null);
                          startTransition(async () => {
                            const result = await revokeApiKeyAction(key.id);
                            if (!result.ok) setError(result.message ?? null);
                          });
                        }}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-danger-500 hover:bg-danger-50 disabled:opacity-50 dark:hover:bg-red-950"
                      >
                        {labels.revoke}
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-faint">{labels.planLimit}</p>
        )}
      </section>

      {/* ---------- Webhooks ---------- */}
      <section>
        <h2 className="font-display text-base font-semibold tracking-tight">{labels.webhooks}</h2>
        <p className="mt-1 text-sm text-muted">
          {labels.webhooksIntro}
        </p>

        {features.webhooks ? (
          <>
            <form
              className="mt-4 grid gap-3"
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  const result = await createWebhookAction({
                    url: String(formData.get('url') ?? ''),
                    description: null,
                    eventTypes: formData.getAll('eventTypes').map(String),
                    isActive: true,
                  });

                  if (!result.ok || !result.endpoint) {
                    setError(result.message ?? null);
                    return;
                  }

                  setIssuedSecret({ label: result.endpoint.url, value: result.endpoint.secret });
                });
              }}
            >
              <label className="text-sm">
                <span className="mb-1 block text-muted">
                  {labels.url}
                </span>
                <input
                  name="url"
                  type="url"
                  dir="ltr"
                  required
                  placeholder="https://"
                  className="w-full rounded-lg border border-line px-3 py-2"
                />
              </label>

              <fieldset className="text-sm">
                <legend className="mb-1 text-muted">
                  {labels.events}
                </legend>
                <div className="flex flex-wrap gap-3">
                  {WEBHOOK_EVENT_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="eventTypes" value={type} />
                      <code dir="ltr">{type}</code>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg shadow-sheet transition-colors hover:bg-primary-hover disabled:opacity-45"
                >
                  {labels.add}
                </button>
              </div>
            </form>

            <ul className="mt-6 space-y-2">
              {webhooks.length === 0 ? (
                <li className="text-sm text-faint">{labels.empty}</li>
              ) : (
                webhooks.map((endpoint) => (
                  <li
                    key={endpoint.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs" dir="ltr">
                        {endpoint.url}
                      </p>
                      <p className="mt-0.5 text-xs text-faint" dir="ltr">
                        {endpoint.eventTypes.join(' · ')}
                      </p>
                      {endpoint.disabledAt ? (
                        <p className="mt-0.5 text-xs text-danger-500">
                          {labels.disabled}
                          {endpoint.disabledReason ? ` — ${endpoint.disabledReason}` : ''}
                        </p>
                      ) : endpoint.consecutiveFailures > 0 ? (
                        <p className="mt-0.5 text-xs text-amber-600">
                          {labels.failures}: {endpoint.consecutiveFailures}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!globalThis.confirm(labels.deleteConfirm)) return;
                        setError(null);
                        startTransition(async () => {
                          const result = await deleteWebhookAction(endpoint.id);
                          if (!result.ok) setError(result.message ?? null);
                        });
                      }}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-danger-500 hover:bg-danger-50 disabled:opacity-50 dark:hover:bg-red-950"
                    >
                      {labels.delete}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-faint">{labels.planLimit}</p>
        )}
      </section>

      {/* ---------- CRM ---------- */}
      <section>
        <h2 className="font-display text-base font-semibold tracking-tight">{labels.crm}</h2>
        <p className="mt-1 text-sm text-muted">{labels.crmIntro}</p>

        {features.crmSync ? (
          <>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  const fieldMap: Record<string, string> = {};
                  for (const field of CRM_SYNCABLE_FIELDS) {
                    const value = String(formData.get(`map:${field}`) ?? '').trim();
                    if (value) fieldMap[field] = value;
                  }

                  const token = String(formData.get('accessToken') ?? '').trim();

                  const result = await saveCrmConnectionAction({
                    provider: 'hubspot',
                    // الرمز يُرسل فقط حين يُكتب: تركه فارغاً عند تعديل
                    // الخريطة يبقي الرمز الحالي كما هو.
                    ...(token ? { accessToken: token } : {}),
                    fieldMap,
                    ownerStrategy: String(formData.get('ownerStrategy') ?? 'capturer'),
                    ownerRef: String(formData.get('ownerRef') ?? '') || null,
                    marketingConsentOnly: formData.get('marketingConsentOnly') === 'on',
                    status: 'active',
                  });

                  if (!result.ok) setError(result.message ?? null);
                });
              }}
            >
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted">
                  {labels.accessToken}
                </span>
                <input
                  name="accessToken"
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  className="w-full rounded-lg border border-line px-3 py-2"
                />
                <span className="mt-1 block text-xs text-faint">
                  {labels.accessTokenHint}
                </span>
              </label>

              <fieldset className="text-sm sm:col-span-2">
                <legend className="mb-1 text-muted">
                  {labels.fieldMap}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CRM_SYNCABLE_FIELDS.map((field) => (
                    <label key={field} className="flex items-center gap-2 text-xs">
                      <span className="w-32 shrink-0 text-faint">{field}</span>
                      <input
                        name={`map:${field}`}
                        dir="ltr"
                        defaultValue={
                          connections[0]?.fieldMap[field] ?? HUBSPOT_DEFAULT_FIELD_MAP[field]
                        }
                        className="w-full rounded-lg border border-line px-2 py-1"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="text-sm">
                <span className="mb-1 block text-muted">
                  {labels.ownerStrategy}
                </span>
                <select
                  name="ownerStrategy"
                  defaultValue={connections[0]?.ownerStrategy ?? 'capturer'}
                  className="w-full rounded-lg border border-line px-3 py-2"
                >
                  {(['capturer', 'fixed', 'unassigned'] as const).map((strategy) => (
                    <option key={strategy} value={strategy}>
                      {labels.strategies[strategy]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-muted">
                  {labels.ownerRef}
                </span>
                <input
                  name="ownerRef"
                  dir="ltr"
                  defaultValue={connections[0]?.ownerRef ?? ''}
                  className="w-full rounded-lg border border-line px-3 py-2"
                />
              </label>

              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  name="marketingConsentOnly"
                  defaultChecked={connections[0]?.marketingConsentOnly ?? false}
                  className="mt-1"
                />
                <span>
                  {labels.marketingOnly}
                  <span className="mt-0.5 block text-xs text-faint">
                    {labels.marketingOnlyHint}
                  </span>
                </span>
              </label>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg shadow-sheet transition-colors hover:bg-primary-hover disabled:opacity-45"
                >
                  {labels.connect}
                </button>
              </div>
            </form>

            <ul className="mt-6 space-y-2">
              {connections.length === 0 ? (
                <li className="text-sm text-faint">{labels.empty}</li>
              ) : (
                connections.map((connection) => (
                  <li
                    key={connection.id}
                    className="rounded-card border border-line p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{connection.provider}</p>
                        <p className="mt-0.5 text-xs text-faint">
                          {labels.pending}: {connection.pending} · {labels.failed}:{' '}
                          {connection.failed} · {labels.lastSync}:{' '}
                          {connection.lastSyncAt
                            ? formatDateTime(connection.lastSyncAt, locale)
                            : labels.never}
                        </p>
                        {connection.lastError ? (
                          <p className="mt-0.5 text-xs text-danger-500">{connection.lastError}</p>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setError(null);
                            startTransition(async () => {
                              const result = await syncCrmAction(connection.id);
                              if (!result.ok) setError(result.message ?? null);
                            });
                          }}
                          className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-surface-3 disabled:opacity-50"
                        >
                          {labels.syncAll}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (!globalThis.confirm(labels.deleteConfirm)) return;
                            setError(null);
                            startTransition(async () => {
                              const result = await disconnectCrmAction(connection.id);
                              if (!result.ok) setError(result.message ?? null);
                            });
                          }}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-danger-500 hover:bg-danger-50 disabled:opacity-50 dark:hover:bg-red-950"
                        >
                          {labels.disconnect}
                        </button>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-faint">{labels.planLimit}</p>
        )}
      </section>
    </div>
  );
}
