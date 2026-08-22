import { getTranslations } from 'next-intl/server';
import { EmptyState, Panel, PanelHeader } from '@nomiqa/ui';
import { fetchFeatureFlags } from '@/lib/admin';
import { FlagRow } from './flag-row';

export default async function AdminFlagsPage() {
  const t = await getTranslations();
  const flags = await fetchFeatureFlags();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{t('admin.flags.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('admin.flags.subtitle')}</p>
      </div>

      <Panel>
        <PanelHeader title={t('admin.flags.title')} />

        {flags.length === 0 ? (
          <EmptyState icon="settings" title={t('admin.flags.empty')} />
        ) : (
          <ul className="divide-y divide-line">
            {flags.map((flag) => (
              <FlagRow key={flag.key} flag={flag} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
