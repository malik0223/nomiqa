import { PageHeader } from '@nomiqa/ui';
import type {
  ApiKeySummary,
  CrmConnectionSummary,
  OrganizationEntitlements,
  WebhookEndpointSummary,
} from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@/lib/api-client';
import { fetchEntitlementsSummary } from '@/lib/billing';
import { activeOrganizationId } from '@/lib/cards';
import { fetchApiKeys, fetchCrmConnections, fetchWebhooks } from '@/lib/sales';
import { IntegrationsPanel } from './integrations-panel';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** شاشة التكاملات (§11.4 و§11.5). */
export default async function IntegrationsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations();

  let apiKeys: ApiKeySummary[];
  let webhooks: WebhookEndpointSummary[];
  let connections: CrmConnectionSummary[];
  let entitlements: OrganizationEntitlements;

  try {
    const organizationId = await activeOrganizationId();

    // كل قائمة تسقط إلى الفارغ وحدها: الأقسام الثلاثة مستقلة، وفشل
    // واحد — أو غياب صلاحية عنه — لا يجوز أن يحجب الشاشة كلها.
    [apiKeys, webhooks, connections, entitlements] = await Promise.all([
      fetchApiKeys(organizationId).catch(() => [] as ApiKeySummary[]),
      fetchWebhooks(organizationId).catch(() => [] as WebhookEndpointSummary[]),
      fetchCrmConnections(organizationId).catch(() => [] as CrmConnectionSummary[]),
      fetchEntitlementsSummary(organizationId),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <PageHeader eyebrow={t('nav.groups.organization')} title={t('integrations.title')} />
        <p className="mt-4 text-muted">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader eyebrow={t('nav.groups.organization')} title={t('integrations.title')} />
      <p className="mt-2 text-sm text-muted">
        {t('integrations.intro')}
      </p>

      <IntegrationsPanel
        apiKeys={apiKeys}
        webhooks={webhooks}
        connections={connections}
        features={{
          publicApi: entitlements.features.includes('public_api'),
          webhooks: entitlements.features.includes('webhooks'),
          crmSync: entitlements.features.includes('crm_sync'),
        }}
        locale={locale}
        labels={{
          keys: t('integrations.keys'),
          keysIntro: t('integrations.keysIntro'),
          keyName: t('integrations.keyName'),
          scopes: t('integrations.scopes'),
          issue: t('integrations.issue'),
          revoke: t('integrations.revoke'),
          revokeConfirm: t('integrations.revokeConfirm'),
          lastUsed: t('integrations.lastUsed'),
          never: t('integrations.never'),
          revoked: t('integrations.revoked'),
          secretOnce: t('integrations.secretOnce'),
          copy: t('common.copy'),
          copied: t('common.copied'),
          webhooks: t('integrations.webhooks'),
          webhooksIntro: t('integrations.webhooksIntro'),
          url: t('integrations.url'),
          events: t('integrations.events'),
          add: t('common.add'),
          delete: t('common.delete'),
          deleteConfirm: t('integrations.deleteConfirm'),
          disabled: t('integrations.disabled'),
          failures: t('integrations.failures'),
          crm: t('integrations.crm'),
          crmIntro: t('integrations.crmIntro'),
          accessToken: t('integrations.accessToken'),
          accessTokenHint: t('integrations.accessTokenHint'),
          fieldMap: t('integrations.fieldMap'),
          ownerStrategy: t('integrations.ownerStrategy'),
          ownerRef: t('integrations.ownerRef'),
          marketingOnly: t('integrations.marketingOnly'),
          marketingOnlyHint: t('integrations.marketingOnlyHint'),
          connect: t('integrations.connect'),
          disconnect: t('integrations.disconnect'),
          syncAll: t('integrations.syncAll'),
          pending: t('integrations.pending'),
          failed: t('integrations.failed'),
          lastSync: t('integrations.lastSync'),
          logs: t('integrations.logs'),
          empty: t('integrations.empty'),
          planLimit: t('integrations.planLimit'),
          strategies: {
            capturer: t('integrations.strategies.capturer'),
            fixed: t('integrations.strategies.fixed'),
            unassigned: t('integrations.strategies.unassigned'),
          },
        }}
      />
    </main>
  );
}
