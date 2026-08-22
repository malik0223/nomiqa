import { getTranslations } from 'next-intl/server';
import { EmptyState, Panel, PanelHeader } from '@nomiqa/ui';
import { fetchAudit } from '@/lib/admin';
import { formatDate } from '@/lib/format';

/**
 * سجل تدقيق المنصة — القراءة فقط.
 *
 * لا حذف ولا تعديل ولا حتى تصفية بالمستخدم: السجل يجيب سؤال «من فعل
 * ماذا ومتى»، وأي واجهة تسمح بتغييره تُبطل الغرض منه.
 */
export default async function AdminAuditPage({
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
  const audit = await fetchAudit(page, 30);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t('admin.audit.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('admin.audit.subtitle')}</p>
      </div>

      <Panel>
        <PanelHeader
          title={t('admin.audit.title')}
          description={t('admin.audit.count', { total: audit.meta.total })}
        />

        {audit.data.length === 0 ? (
          <EmptyState icon="shield" title={t('admin.audit.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-5 py-2.5 text-start font-medium">{t('admin.audit.action')}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{t('admin.audit.resource')}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{t('admin.audit.when')}</th>
                  <th className="px-5 py-2.5 text-start font-medium">{t('admin.audit.ip')}</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((entry) => (
                  <tr key={entry.id} className="border-b border-line/60">
                    <td className="px-5 py-3">
                      <bdi className="font-mono text-xs">{entry.action}</bdi>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <bdi className="font-mono text-xs">
                        {entry.resourceType ?? '—'}
                        {entry.resourceId ? `/${entry.resourceId.slice(0, 8)}` : ''}
                      </bdi>
                    </td>
                    <td className="px-5 py-3 text-muted">{formatDate(entry.occurredAt, locale)}</td>
                    <td className="px-5 py-3 text-muted">
                      <bdi className="font-mono text-xs">{entry.ipAddress ?? '—'}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
