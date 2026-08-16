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
import { redirect } from 'next/navigation';
import { ApiError } from '../../../lib/api-client';
import { auth0 } from '../../../lib/auth0';
import { fetchEntitlementsSummary } from '../../../lib/billing';
import { activeOrganizationId } from '../../../lib/cards';
import {
  fetchBranches,
  fetchBrandKit,
  fetchBrandPolicies,
  fetchDepartments,
  fetchDomains,
} from '../../../lib/team';
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
  const { locale } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

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
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('branding.title')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">{t('branding.title')}</h1>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t('branding.visualIdentity')}</h2>
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

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t('branding.policies')}</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
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

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t('branding.customDomain')}</h2>
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
