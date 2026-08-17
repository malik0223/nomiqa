import type { AnalyticsSeriesPoint } from '@nomiqa/contracts';

/**
 * نشاط آخر 7 و30 و90 يوماً (§8.5).
 *
 * أعمدة بـCSS لا مكتبة رسم: البيانات سلسلة يومية بقيمة واحدة، وإضافة
 * مكتبة رسم كاملة إلى حزمة لوحة التحكم لأجلها كلفة لا يقابلها شيء.
 *
 * مكوّن خادمي بالكامل — لا تفاعل فيه سوى `title` الأصلية في المتصفح.
 *
 * يوم الذروة وحده يأخذ اللون الذهبي. هذا ليس تزييناً: السؤال الذي
 * يُطرح أمام هذا الرسم دائماً «متى ارتفع النشاط؟»، وتمييز اليوم
 * يجيبه قبل أن تُقرأ التواريخ.
 */
export function ActivityChart({
  series,
  locale,
  emptyLabel,
  peakLabel,
}: {
  series: AnalyticsSeriesPoint[];
  locale: string;
  emptyLabel: string;
  /** نصّ وسم الذروة، يستقبل `{value}` و`{date}`. */
  peakLabel: (value: number, date: string) => string;
}) {
  const peak = Math.max(...series.map((point) => point.views), 0);

  if (peak === 0) {
    return <p className="py-8 text-center text-sm text-faint">{emptyLabel}</p>;
  }

  const peakPoint = series.find((point) => point.views === peak);
  const dayFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <figure className="mt-1">
      <figcaption className="mb-3 flex items-baseline justify-between gap-4">
        <span className="text-xs text-faint">
          {peakPoint ? peakLabel(peak, dayFormatter.format(new Date(peakPoint.date))) : null}
        </span>
        <span className="nq-num text-xs text-faint">{peak}</span>
      </figcaption>

      {/* خطّ الأساس المرسوم تحت الأعمدة يمنع قراءة يوم بلا نشاط
          كفجوة في الرسم. */}
      <ul className="flex h-32 items-end gap-[3px] border-b border-line" dir="ltr">
        {series.map((point) => {
          const label = dayFormatter.format(new Date(point.date));
          // حد أدنى مرئي: يوم بزيارة واحدة يجب أن يظهر عموداً لا فراغاً،
          // وإلا بدا كيوم بلا نشاط إطلاقاً.
          const height = point.views === 0 ? 1 : Math.max(4, (point.views / peak) * 100);
          const isPeak = point.views === peak;

          return (
            <li
              key={point.date}
              className={`flex-1 rounded-t-[2px] transition-opacity hover:opacity-80 ${
                isPeak ? 'bg-accent-line' : 'bg-primary/55'
              }`}
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

      <div className="mt-2 flex justify-between text-[0.6875rem] text-faint" dir="ltr">
        <span>{first ? dayFormatter.format(new Date(first.date)) : null}</span>
        <span>{last ? dayFormatter.format(new Date(last.date)) : null}</span>
      </div>
    </figure>
  );
}
