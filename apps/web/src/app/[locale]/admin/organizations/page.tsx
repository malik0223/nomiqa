import { getTranslations } from 'next-intl/server';
import { Badge, EmptyState, Panel, PanelHeader } from '@nomiqa/ui';
import { fetchOrganizations } from '@/lib/admin';
import { formatDate } from '@/lib/format';
import { OrganizationRowActions } from './row-actions';

export default async function AdminOrganizationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations();

  const page = Number(query.page ?? '1') || 1;
  const organizations = await fetchOrganizations(page, 25);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t('admin.organizations.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('admin.organizations.subtitle')}</p>
      </div>

      <Panel>
        <PanelHeader
          title={t('admin.organizations.title')}
          description={t('admin.organizations.count', { total: organizations.meta.total })}
        />

        {organizations.data.length === 0 ? (
          <EmptyState icon="building" title={t('admin.organizations.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-5 py-2.5 text-start font-medium">
                    {t('admin.organizations.name')}
                  </th>
                  <th className="px-5 py-2.5 text-start font-medium">
                    {t('admin.organizations.kind')}
                  </th>
                  <th className="px-5 py-2.5 text-end font-medium">
                    {t('admin.organizations.members')}
                  </th>
                  <th className="px-5 py-2.5 text-end font-medium">
                    {t('admin.organizations.files')}
                  </th>
                  <th className="px-5 py-2.5 text-start font-medium">
                    {t('admin.organizations.created')}
                  </th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {organizations.data.map((organization) => (
                  <tr key={organization.id} className="border-b border-line/60">
                    <td className="px-5 py-3">
                      <div className="font-medium text-fg">{organization.name}</div>
                      <bdi className="block font-mono text-xs text-muted">/{organization.slug}</bdi>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={organization.kind === 'personal' ? 'neutral' : 'ink'}>
                        {organization.kind}
                      </Badge>
                    </td>
                    <td className="nq-num px-5 py-3 text-end">{organization.memberCount}</td>
                    <td className="nq-num px-5 py-3 text-end">{organization.fileCount}</td>
                    <td className="px-5 py-3 text-muted">
                      {formatDate(organization.createdAt, locale)}
                    </td>
                    <td className="px-5 py-3 text-end">
                      <OrganizationRowActions
                        organizationId={organization.id}
                        organizationName={organization.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {organizations.meta.totalPages > 1 ? (
        <nav className="flex items-center justify-between text-sm">
          <a
            href={`?page=${Math.max(1, page - 1)}`}
            aria-disabled={page <= 1}
            className={page <= 1 ? 'pointer-events-none text-muted/50' : 'text-accent'}
          >
            {t('common.previous')}
          </a>
          <span className="nq-num text-muted">
            {page} / {organizations.meta.totalPages}
          </span>
          <a
            href={`?page=${Math.min(organizations.meta.totalPages, page + 1)}`}
            aria-disabled={page >= organizations.meta.totalPages}
            className={
              page >= organizations.meta.totalPages ? 'pointer-events-none text-muted/50' : 'text-accent'
            }
          >
            {t('common.next')}
          </a>
        </nav>
      ) : null}
    </div>
  );
}
