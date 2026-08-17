import { PageHeader } from '@nomiqa/ui';
import type {
  BranchSummary,
  BrandKitPayload,
  BrandPolicySummary,
  CustomDomainSummary,
  DepartmentNode,
  OrganizationEntitlements,
} from '@nomiqa/contracts';
import { LOCKABLE_FIELDS } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@/lib/api-client';
import { fetchEntitlementsSummary } from '@/lib/billing';
import { activeOrganizationId } from '@/lib/cards';
import {
  fetchBranches,
  fetchBrandKit,
  fetchBrandPolicies,
  fetchDepartments,
  fetchDomains,
} from '@/lib/team';
import { BrandKitForm } from './brand-kit-form';
import { DomainsPanel } from './domains-panel';
import { PoliciesPanel } from './policies-panel';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/**
 * شاشة الهوية المؤسسية (§9.3).
 *
 * ثلاثة أقسام: الألوان والشعار، سياسات البطاقات، والنطاق المخصص.
 * الميزات المقفلة بالباقة تُعرض معطّلة مع سببها لا مخفية: المسؤول
 * الذي لا يرى الميزة لا يعرف أنها موجودة، فلا يفكر في الترقية.
 */
export default async function BrandingPage({ params }: PageProps) {
  await params;
  const t = await getTranslations();

  let kit: BrandKitPayload;
  let policies: BrandPolicySummary[];
  let domains: CustomDomainSummary[];
  let departments: DepartmentNode[];
  let branches: BranchSummary[];
  let entitlements: OrganizationEntitlements;

  try {
    const organizationId = await activeOrganizationId();

    [kit, policies, domains, departments, branches, entitlements] = await Promise.all([
      fetchBrandKit(organizationId),
      fetchBrandPolicies(organizationId).catch(() => [] as BrandPolicySummary[]),
      fetchDomains(organizationId).catch(() => [] as CustomDomainSummary[]),
      fetchDepartments(organizationId),
      fetchBranches(organizationId),
      fetchEntitlementsSummary(organizationId),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <PageHeader eyebrow={t('nav.groups.identity')} title={t('branding.title')} />
        <p className="mt-4 text-muted">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader eyebrow={t('nav.groups.identity')} title={t('branding.title')} />

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('branding.visualIdentity')}</h2>
        <BrandKitForm
          kit={kit}
          available={entitlements.features.includes('brand_kit')}
          labels={{
            primaryColor: t('branding.primaryColor'),
            secondaryColor: t('branding.secondaryColor'),
            textColor: t('branding.textColor'),
            backgroundColor: t('branding.backgroundColor'),
            fontFamily: t('branding.fontFamily'),
            hideBadge: t('branding.hidePlatformBadge'),
            hideBadgeLocked: t('branding.hidePlatformBadgeLocked'),
            save: t('common.save'),
            saving: t('common.saving'),
            saved: t('common.saved'),
            planLimit: t('branding.planLimit'),
          }}
        />
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('branding.policies')}</h2>
        <p className="mt-1 text-sm text-muted">
          {t('branding.policiesHint')}
        </p>
        <PoliciesPanel
          policies={policies}
          departments={flatten(departments)}
          branches={branches}
          lockableFields={[...LOCKABLE_FIELDS]}
          canLockFields={entitlements.features.includes('locked_fields')}
          canRequireApproval={entitlements.features.includes('approval_workflow')}
          labels={{
            name: t('branding.policyName'),
            scope: t('branding.policyScope'),
            organization: t('branding.wholeOrganization'),
            department: t('team.department'),
            branch: t('team.branch'),
            lockedFields: t('branding.lockedFields'),
            requireApproval: t('branding.requireApproval'),
            add: t('common.add'),
            delete: t('common.delete'),
            deleteConfirm: t('branding.deletePolicyConfirm'),
            empty: t('branding.noPolicies'),
            planLimit: t('branding.planLimit'),
            fieldLabels: Object.fromEntries(
              LOCKABLE_FIELDS.map((field) => [field, t(`branding.fields.${field}`)]),
            ),
          }}
        />
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('branding.customDomain')}</h2>
        <DomainsPanel
          domains={domains}
          available={entitlements.features.includes('custom_domain')}
          labels={{
            hostname: t('branding.hostname'),
            add: t('common.add'),
            delete: t('common.delete'),
            deleteConfirm: t('branding.deleteDomainConfirm'),
            verifyHint: t('branding.domainVerifyHint'),
            recordName: t('branding.recordName'),
            recordValue: t('branding.recordValue'),
            copy: t('common.copy'),
            copied: t('common.copied'),
            empty: t('branding.noDomains'),
            planLimit: t('branding.planLimit'),
            statusLabel: {
              pending: t('branding.domainStatus.pending'),
              verifying: t('branding.domainStatus.verifying'),
              active: t('branding.domainStatus.active'),
              failed: t('branding.domainStatus.failed'),
              disabled: t('branding.domainStatus.disabled'),
            },
          }}
        />
      </section>
    </main>
  );
}

function flatten(nodes: DepartmentNode[]): Array<{ id: string; name: string }> {
  return nodes.flatMap((node) => [{ id: node.id, name: node.name }, ...flatten(node.children)]);
}
