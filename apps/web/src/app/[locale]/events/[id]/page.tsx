import type { EventReport } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ApiError } from '../../../../lib/api-client';
import { auth0 } from '../../../../lib/auth0';
import { activeOrganizationId } from '../../../../lib/cards';
import { fetchEventReport } from '../../../../lib/sales';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * لوحة الفعالية المباشرة وتقريرها (§11.3).
 *
 * شاشة واحدة للاثنين لا شاشتان: الأرقام تُقرأ من صفوف جهات الاتصال،
 * فما يُعرض أثناء المعرض هو نفسه ما يُعرض بعده. لوحة «مباشرة» بمصدر
 * مختلف كانت ستُظهر أرقاماً تخالف التقرير الذي يصل بالبريد بعد يومين —
 * وأول من يلاحظ الفرق هو من يوقّع على ميزانية المعرض القادم.
 */
export default async function EventReportPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  let report: EventReport;

  try {
    const organizationId = await activeOrganizationId();
    report = await fetchEventReport(organizationId, id);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : t('errors.generic');

    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('events.report')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">{message}</p>
      </main>
    );
  }

  const peak = Math.max(1, ...report.series.map((point) => point.leads));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-neutral-500">{t(`events.status.${report.status}`)}</p>
      <h1 className="mt-1 text-2xl font-bold">{report.name}</h1>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t('events.leads')} value={report.leads} />
        <Stat label={t('events.qualifiedLeads')} value={report.qualifiedLeads} />
        <Stat label={t('events.qualificationRate')} value={`${report.qualificationRate}%`} />
        <Stat
          label={t('events.costPerLead')}
          // «—» لا صفر حين لا تُحسب: فعالية بكلفة معلنة ولم تجلب أحداً
          // كلفتها لكل عميل غير معرَّفة، وعرض صفر يُقرأ «مجانية».
          value={report.costPerLeadBaisa === null ? '—' : formatOmr(report.costPerLeadBaisa)}
        />
      </dl>

      {report.targetLeads !== null ? (
        <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
          {t('events.targetProgress', { leads: report.leads, target: report.targetLeads })}
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t('events.daily')}</h2>
        <div className="mt-4 flex h-32 items-end gap-1" dir="ltr">
          {report.series.length === 0 ? (
            <p className="text-sm text-neutral-500">{t('events.noLeadsYet')}</p>
          ) : (
            report.series.map((point) => (
              <div
                key={point.date}
                title={`${new Date(point.date).toLocaleDateString()} — ${point.leads}`}
                style={{ height: `${Math.round((point.leads / peak) * 100)}%` }}
                className="min-h-px flex-1 rounded-t bg-neutral-300 dark:bg-neutral-700"
              />
            ))
          )}
        </div>
      </section>

      {/*
        مقارنة الفريق: أرقام لا ترتيب مُعلَن بجائزة. الغاية أن يعرف
        المسؤول أين يحتاج فريقه دعماً، وعرضها بالاسم يكفي لذلك — أما
        وسم «الأول» و«الأخير» فيحوّل أداة إدارة إلى لوحة شرف تُقرأ
        بالمقلوب.
      */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t('events.team')}</h2>

        {report.members.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">{t('events.noLeadsYet')}</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-neutral-500">
                <th className="py-2 text-start font-normal">{t('events.member')}</th>
                <th className="py-2 text-start font-normal">{t('events.leads')}</th>
                <th className="py-2 text-start font-normal">{t('events.qualifiedLeads')}</th>
                <th className="py-2 text-start font-normal">{t('events.duplicates')}</th>
              </tr>
            </thead>
            <tbody>
              {report.members.map((member) => (
                <tr key={member.userId} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2">{member.fullName ?? t('events.unassigned')}</td>
                  <td className="py-2">{member.leads}</td>
                  <td className="py-2">{member.qualifiedLeads}</td>
                  <td className="py-2">{member.duplicates}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {Object.keys(report.qualifierBreakdown).length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t('events.qualifierBreakdown')}</h2>

          <div className="mt-4 space-y-4">
            {Object.entries(report.qualifierBreakdown).map(([key, values]) => (
              <div key={key} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                <p className="text-sm font-medium">{key}</p>
                <ul className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {Object.entries(values).length === 0 ? (
                    <li>{t('events.noValues')}</li>
                  ) : (
                    Object.entries(values).map(([value, count]) => (
                      <li key={value}>
                        {value}: {count}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-8 text-xs text-neutral-500">
        {t('events.scannedLeads', { count: report.scannedLeads })}
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
    </div>
  );
}

/** البيسة إلى ريال للعرض فقط — التخزين والحساب يبقيان أعداداً صحيحة. */
function formatOmr(baisa: number): string {
  return `${Math.floor(baisa / 1000)}.${String(baisa % 1000).padStart(3, '0')}`;
}
