import { PageHeader } from '@nomiqa/ui';
import type {
  BranchSummary,
  DepartmentNode,
  EmployeeImportSummary,
  InvitationSummary,
  MemberSummary,
  OrganizationEntitlements,
  Paginated,
} from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@/lib/api-client';
import { activeOrganizationId } from '@/lib/cards';
import { fetchEntitlementsSummary } from '@/lib/billing';
import {
  fetchBranches,
  fetchDepartments,
  fetchImports,
  fetchInvitations,
  fetchMembers,
} from '@/lib/team';
import { InviteForm } from './invite-form';
import { MembersTable } from './members-table';
import { UnitsPanel } from './units-panel';
import { ImportPanel } from './import-panel';
import { formatDate } from '@/lib/format';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * شاشة إدارة الفريق (§9.2).
 *
 * أربعة أقسام في صفحة واحدة لا أربع صفحات: مسؤول يضيف موظفاً يحتاج
 * أن يرى الإدارات المتاحة والمقاعد المتبقية في اللحظة نفسها، وتوزيعها
 * على مسارات منفصلة كان يعني ذهاباً وإياباً في كل إضافة.
 *
 * بوابة الخروج تقول «50–100 موظف بلا تدخل تقني»، وهذا يعني أن كل ما
 * يحتاجه المسؤول في مكان واحد.
 */
export default async function TeamPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations();

  let members: Paginated<MemberSummary>;
  let invitations: InvitationSummary[];
  let departments: DepartmentNode[];
  let branches: BranchSummary[];
  let imports: EmployeeImportSummary[];
  let entitlements: OrganizationEntitlements;

  try {
    const organizationId = await activeOrganizationId();

    [members, invitations, departments, branches, imports, entitlements] = await Promise.all([
      fetchMembers(organizationId, {
        page: query.page ?? 1,
        q: query.q,
        departmentId: query.departmentId,
        branchId: query.branchId,
        status: query.status ?? 'active',
      }),
      fetchInvitations(organizationId),
      fetchDepartments(organizationId),
      fetchBranches(organizationId),
      fetchImports(organizationId),
      fetchEntitlementsSummary(organizationId),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');
    const requestId = error instanceof ApiError ? error.requestId : undefined;

    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        <PageHeader eyebrow={t('nav.groups.organization')} title={t('team.title')} />
        <p className="mt-4 text-muted">{message}</p>
        {requestId ? (
          <p className="mt-2 font-mono text-xs text-faint">requestId: {requestId}</p>
        ) : null}
      </main>
    );
  }

  const seatsUsed = entitlements.usage.members;
  const seatLimit = entitlements.limits.maxMembers;
  const seatsExhausted = seatLimit >= 0 && seatsUsed >= seatLimit;

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <PageHeader eyebrow={t('nav.groups.organization')} title={t('team.title')} />
        <p className="text-sm text-faint">
          {t('team.seats', {
            used: seatsUsed,
            max: seatLimit < 0 ? t('billing.unlimited') : seatLimit,
          })}
        </p>
      </header>

      {/* التحذير قبل النموذج لا بعده: من بلغ الحد يجب أن يعرف قبل أن
          يكتب بريد موظف ويضغط «دعوة» فيُرفض. */}
      {seatsExhausted ? (
        <p className="mt-4 rounded-lg border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-600 dark:border-amber-800">
          {t('team.seatsExhausted')}
        </p>
      ) : null}

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('team.invite')}</h2>
        <InviteForm
          departments={flatten(departments)}
          branches={branches}
          disabled={seatsExhausted}
          labels={{
            email: t('team.email'),
            role: t('team.role'),
            roleAdmin: t('team.roles.admin'),
            roleMember: t('team.roles.member'),
            department: t('team.department'),
            branch: t('team.branch'),
            jobTitle: t('team.jobTitle'),
            none: t('team.none'),
            submit: t('team.sendInvite'),
            sending: t('common.saving'),
            copyLink: t('team.copyInviteLink'),
            copied: t('common.copied'),
            linkOnce: t('team.inviteLinkOnce'),
          }}
        />
      </section>

      {invitations.length > 0 ? (
        <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
          <h2 className="font-display text-base font-semibold tracking-tight">{t('team.pendingInvites')}</h2>
          <ul className="mt-4 divide-y divide-line">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex-1 text-sm">{invitation.email}</span>
                <span className="text-xs text-faint">
                  {t(`team.invitationStatus.${invitation.status}`)}
                </span>
                <span className="text-xs text-faint">
                  {formatDate(invitation.expiresAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('team.members')}</h2>
        <MembersTable
          members={members.data}
          departments={flatten(departments)}
          branches={branches}
          meta={members.meta}
          labels={{
            name: t('team.name'),
            email: t('team.email'),
            role: t('team.role'),
            department: t('team.department'),
            branch: t('team.branch'),
            cards: t('team.cards'),
            status: t('team.status'),
            actions: t('common.actions'),
            edit: t('common.edit'),
            save: t('common.save'),
            cancel: t('common.cancel'),
            offboard: t('team.offboard'),
            offboardConfirm: t('team.offboardConfirm'),
            unpublishCards: t('team.unpublishCards'),
            transferTo: t('team.transferTo'),
            reinstate: t('team.reinstate'),
            none: t('team.none'),
            empty: t('team.noMembers'),
            revoked: t('team.revoked'),
            active: t('team.active'),
          }}
        />
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('team.structure')}</h2>
        <UnitsPanel
          departments={departments}
          branches={branches}
          canAddDepartment={
            entitlements.limits.maxDepartments < 0 ||
            entitlements.usage.departments < entitlements.limits.maxDepartments
          }
          canAddBranch={
            entitlements.limits.maxBranches < 0 ||
            entitlements.usage.branches < entitlements.limits.maxBranches
          }
          labels={{
            departments: t('team.departments'),
            branches: t('team.branches'),
            name: t('team.name'),
            code: t('team.code'),
            parent: t('team.parentDepartment'),
            city: t('team.city'),
            add: t('common.add'),
            delete: t('common.delete'),
            deleteConfirm: t('team.deleteUnitConfirm'),
            none: t('team.none'),
            members: t('team.membersCount'),
            planLimit: t('team.structurePlanLimit'),
            empty: t('team.noUnits'),
          }}
        />
      </section>

      <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-sheet sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">{t('team.bulkImport')}</h2>
        <ImportPanel
          imports={imports}
          available={entitlements.features.includes('csv_import')}
          labels={{
            hint: t('team.importHint'),
            columns: t('team.importColumns'),
            file: t('team.importFile'),
            createCards: t('team.importCreateCards'),
            sendInvites: t('team.importSendInvites'),
            submit: t('team.startImport'),
            uploading: t('common.saving'),
            planLimit: t('team.importPlanLimit'),
            history: t('team.importHistory'),
            invited: t('team.importInvited'),
            updated: t('team.importUpdated'),
            skipped: t('team.importSkipped'),
            errors: t('team.importErrors'),
            empty: t('team.noImports'),
            statusLabel: {
              pending: t('team.importStatus.pending'),
              processing: t('team.importStatus.processing'),
              completed: t('team.importStatus.completed'),
              failed: t('team.importStatus.failed'),
            },
          }}
        />
      </section>
    </main>
  );
}

/** يسطّح شجرة الإدارات للقوائم المنسدلة مع إبراز العمق بالمسافات. */
function flatten(
  nodes: DepartmentNode[],
  depth = 0,
): Array<{ id: string; name: string; depth: number }> {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, depth },
    ...flatten(node.children, depth + 1),
  ]);
}
