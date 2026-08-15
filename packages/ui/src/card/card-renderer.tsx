import type { CardSection, CardSnapshot, TemplateDefinition } from '@nomiqa/contracts';
import { cn } from '../cn';
import { linkLabel, toHref, visibleLinks } from './link-utils';

export interface CardRendererProps {
  snapshot: CardSnapshot;
  template: TemplateDefinition;
  /** لغة العرض. تسقط إلى لغة البطاقة الافتراضية عند غياب الترجمة. */
  locale: string;
}

/**
 * محرك عرض البطاقات.
 *
 * وثيقة المعمارية §4.4: **لا يُبنى كل قالب كبطاقة مستقلة ذات منطق
 * خاص.** محرك واحد يستقبل البيانات وتعريف القالب والثيم وترتيب
 * الأقسام. إضافة قالب تصبح صفاً في قاعدة البيانات لا مكوّناً جديداً،
 * وإصلاح خلل في العرض يصلحه في كل القوالب دفعة واحدة.
 *
 * لا حالة ولا تأثيرات هنا: المكوّن خادمي بالكامل، فتُقدَّم الصفحة
 * العامة بلا JavaScript تقريباً (§4.9).
 */
export function CardRenderer({ snapshot, template, locale }: CardRendererProps) {
  // المحتوى باللغة المطلوبة، وإلا بالافتراضية، وإلا بأي لغة متاحة —
  // بطاقة بلا محتوى معروض أسوأ من بطاقة بلغة غير مفضّلة.
  const content =
    snapshot.content[locale] ??
    snapshot.content[snapshot.defaultLocale] ??
    Object.values(snapshot.content)[0];

  if (!content) {
    return null;
  }

  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const links = visibleLinks(snapshot.links);
  const primary = links.filter((link) => link.isPrimary);
  const secondary = links.filter((link) => !link.isPrimary);

  const theme = { ...template.theme, ...snapshot.theme };
  const radius = radiusClass(theme.borderRadius);

  // ترتيب الأقسام من البطاقة إن وُجد، وإلا من القالب.
  const sections = snapshot.sectionOrder?.length > 0 ? snapshot.sectionOrder : template.sections;

  const renderSection = (section: CardSection) => {
    switch (section) {
      case 'identity':
        return (
          <header key="identity" className={cn('flex flex-col gap-3', alignClass(template.layout))}>
            {snapshot.media.avatarUrl ? (
              <img
                src={snapshot.media.avatarUrl}
                alt=""
                width={112}
                height={112}
                className={cn('h-28 w-28 object-cover', radius)}
              />
            ) : null}

            <div className={cn('flex flex-col gap-1', alignClass(template.layout))}>
              <h1 className="text-2xl font-bold tracking-tight">{content.fullName}</h1>

              {content.jobTitle ? (
                <p className="text-base text-neutral-600 dark:text-neutral-400">
                  {content.jobTitle}
                </p>
              ) : null}

              {content.organizationName ? (
                <p className="text-sm text-neutral-500">
                  {content.organizationName}
                  {content.department ? ` — ${content.department}` : ''}
                </p>
              ) : null}
            </div>

            {content.bio ? (
              <p className="mt-2 max-w-prose text-sm leading-7 text-neutral-700 dark:text-neutral-300">
                {content.bio}
              </p>
            ) : null}

            {content.addressLine ? (
              <p className="text-sm text-neutral-500">{content.addressLine}</p>
            ) : null}
          </header>
        );

      case 'actions':
        if (primary.length === 0) return null;
        return (
          <section key="actions" className="flex flex-col gap-2">
            {primary.map((link) => (
              <a
                key={link.id}
                href={toHref(link)}
                // الروابط الخارجية فقط تحتاج noopener؛ tel/mailto لا تفتح نافذة.
                {...externalAttributes(link.type)}
                className={cn(
                  'block px-5 py-3 text-center text-sm font-medium text-white transition-opacity hover:opacity-90',
                  radius,
                )}
                style={{ backgroundColor: theme.primaryColor }}
              >
                {linkLabel(link, locale)}
              </a>
            ))}
          </section>
        );

      case 'links':
        if (secondary.length === 0) return null;
        return (
          <section key="links" className="flex flex-col gap-2">
            {secondary.map((link) => (
              <a
                key={link.id}
                href={toHref(link)}
                {...externalAttributes(link.type)}
                className={cn(
                  'flex items-center justify-between gap-3 border border-neutral-200 px-4 py-3 text-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900',
                  radius,
                )}
              >
                <span className="font-medium">{linkLabel(link, locale)}</span>
                <span className="truncate text-xs text-neutral-500" dir="ltr">
                  {displayValue(link.type, link.value)}
                </span>
              </a>
            ))}
          </section>
        );

      case 'documents':
      default:
        return null;
    }
  };

  return (
    <article dir={dir} className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-10">
      {template.supportsCover && snapshot.media.coverUrl ? (
        <img
          src={snapshot.media.coverUrl}
          alt=""
          className={cn('h-32 w-full object-cover', radius)}
        />
      ) : null}

      {sections.map(renderSection)}
    </article>
  );
}

function alignClass(layout: TemplateDefinition['layout']): string {
  // start يحترم الاتجاه تلقائياً: يبدأ يميناً في RTL ويساراً في LTR.
  return layout === 'centered' || layout === 'cover'
    ? 'items-center text-center'
    : 'items-start text-start';
}

function radiusClass(radius: TemplateDefinition['theme']['borderRadius']): string {
  switch (radius) {
    case 'small':
      return 'rounded-md';
    case 'large':
      return 'rounded-2xl';
    case 'medium':
    default:
      return 'rounded-lg';
  }
}

function externalAttributes(type: string) {
  const internal = type === 'phone' || type === 'email';
  return internal ? {} : { target: '_blank' as const, rel: 'noopener noreferrer' };
}

/** يعرض القيمة مختصرة: النطاق بدل الرابط الكامل. */
function displayValue(type: string, value: string): string {
  if (type === 'phone' || type === 'email' || type === 'whatsapp') {
    return value;
  }

  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname;
  } catch {
    return value;
  }
}
