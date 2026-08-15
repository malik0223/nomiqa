import type { AnalyticsSeriesPoint } from '@nomiqa/contracts';

/**
 * نشاط آخر 7 و30 يوماً (§8.5).
 *
 * أعمدة بـCSS لا مكتبة رسم: البيانات سلسلة يومية بقيمة واحدة، وإضافة
 * مكتبة رسم كاملة إلى حزمة لوحة التحكم لأجلها كلفة لا يقابلها شيء.
 *
 * مكوّن خادمي بالكامل — لا تفاعل فيه سوى `title` الأصلية في المتصفح.
 */
export function ActivityChart({
  series,
  locale,
  emptyLabel,
}: {
  series: AnalyticsSeriesPoint[];
  locale: string;
  emptyLabel: string;
}) {
  const peak = Math.max(...series.map((point) => point.views), 0);

  if (peak === 0) {
    return <p className="mt-4 text-sm text-neutral-500">{emptyLabel}</p>;
  }

  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });

  return (
    <ul className="mt-4 flex h-32 items-end gap-0.5" dir="ltr">
      {series.map((point) => {
        const label = formatter.format(new Date(point.date));
        // حد أدنى مرئي: يوم بزيارة واحدة يجب أن يظهر عموداً لا فراغاً،
        // وإلا بدا كيوم بلا نشاط إطلاقاً.
        const height = point.views === 0 ? 0 : Math.max(4, (point.views / peak) * 100);

        return (
          <li
            key={point.date}
            className="flex-1 rounded-t bg-brand-600/80"
            style={{ height: `${height}%` }}
            title={`${label} — ${point.views}`}
          >
            <span className="sr-only">
              {label}: {point.views}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
