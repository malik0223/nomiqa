import type { CardLinkData, CardSection, CardSnapshot, TemplateDefinition } from '@nomiqa/contracts';
import { cn } from '../cn';
import { Icon, type IconName } from '../icon';
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
 *
 * ملاحظة تصميمية مهمّة: **هذه البطاقة ليست واجهة نميقة.** لون
 * الهوية هنا يأتي من `theme.primaryColor` الذي يختاره صاحب
 * البطاقة، ولا يُفرض عليه نيلي المنصّة ولا ذهبها. الطابع النميقي
 * يظهر في إطار المعاينة وفي الشريط السفلي فقط.
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
  const accent = theme.primaryColor ?? '#2a3d6f';
  const radius = radiusClass(theme.borderRadius);
  const centered = template.layout === 'centered' || template.layout === 'cover';
  const hasCover = template.supportsCover && Boolean(snapshot.media.coverUrl);

  // ترتيب الأقسام من البطاقة إن وُجد، وإلا من القالب.
  const sections = snapshot.sectionOrder?.length > 0 ? snapshot.sectionOrder : template.sections;

  const renderSection = (section: CardSection) => {
    switch (section) {
      case 'identity':
        return (
          <header
            key="identity"
            className={cn('flex flex-col gap-4 px-6', centered ? 'items-center' : 'items-start')}
          >
            {/* الصورة ترتفع فوق الغلاف حين يوجد غلاف: التداخل يربط
                الاثنين بصرياً بدل أن يبدوا لوحين منفصلين. */}
            {snapshot.media.avatarUrl ? (
              <img
                src={snapshot.media.avatarUrl}
                alt=""
                width={112}
                height={112}
                className={cn(
                  'h-28 w-28 object-cover ring-4 ring-white dark:ring-neutral-900',
                  hasCover && '-mt-16',
                  theme.borderRadius === 'large' ? 'rounded-full' : radius,
                )}
              />
            ) : null}

            <div className={cn('flex flex-col gap-1', centered ? 'items-center text-center' : 'items-start')}>
              <h1 className="font-display text-[1.625rem] font-bold leading-tight tracking-tight">
                {content.fullName}
              </h1>

              {content.jobTitle ? (
                <p className="text-[0.9375rem] font-medium" style={{ color: accent }}>
                  {content.jobTitle}
                </p>
              ) : null}

              {content.organizationName ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                  <Icon name="building" size={14} />
                  {content.organizationName}
                  {content.department ? ` — ${content.department}` : ''}
                </p>
              ) : null}
            </div>

            {content.bio ? (
              <p
                className={cn(
                  'max-w-prose text-sm leading-7 text-neutral-600 dark:text-neutral-300',
                  centered && 'text-center',
                )}
              >
                {content.bio}
              </p>
            ) : null}

            {content.addressLine ? (
              <p className="flex items-center gap-1.5 text-[0.8125rem] text-neutral-500">
                <Icon name="globe" size={14} />
                {content.addressLine}
              </p>
            ) : null}
          </header>
        );

      case 'actions':
        if (primary.length === 0) return null;
        return (
          <section key="actions" className="flex flex-col gap-2.5 px-6">
            {primary.map((link) => (
              <a
                key={link.id}
                href={toHref(link)}
                // الروابط الخارجية فقط تحتاج noopener؛ tel/mailto لا تفتح نافذة.
                {...externalAttributes(link.type)}
                // سمة بيانات لا مستمع: المحرك خادمي بالكامل، والقياس
                // يلتقط النقرة بمستمع واحد مفوَّض على المستند. إضافة
                // onClick هنا كانت ستحوّل كل البطاقة إلى مكوّن عميل.
                data-link-id={link.id}
                className={cn(
                  'flex items-center justify-center gap-2 px-5 py-3.5 text-center text-sm font-semibold text-white',
                  'transition-transform duration-150 active:scale-[0.99]',
                  radius,
                )}
                style={{ backgroundColor: accent }}
              >
                <Icon name={linkIcon(link)} size={17} />
                {linkLabel(link, locale)}
              </a>
            ))}
          </section>
        );

      case 'links':
        if (secondary.length === 0) return null;
        return (
          <section key="links" className="flex flex-col gap-2 px-6">
            {secondary.map((link) => (
              <a
                key={link.id}
                href={toHref(link)}
                {...externalAttributes(link.type)}
                data-link-id={link.id}
                className={cn(
                  'group flex items-center gap-3 border border-neutral-200 bg-white/60 px-4 py-3 text-sm',
                  'transition-colors hover:border-neutral-300 hover:bg-neutral-50',
                  'dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:bg-neutral-800/60',
                  radius,
                )}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${accent}14`, color: accent }}
                >
                  <Icon name={linkIcon(link)} size={16} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{linkLabel(link, locale)}</span>
                  {/* `bdi` لا `dir="ltr"`: العزل يكفي لعرض القيمة
                      اللاتينية بترتيبها الصحيح، بينما فرض الاتجاه كان
                      يزيحها إلى الحافة المقابلة للسطر العربي فوقها. */}
                  <bdi className="block truncate text-xs text-neutral-500">
                    {displayValue(link.type, link.value)}
                  </bdi>
                </span>

                <Icon
                  name="chevronEnd"
                  size={16}
                  className="text-neutral-300 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 dark:text-neutral-600"
                />
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
    <article
      dir={dir}
      className="mx-auto flex w-full max-w-md flex-col gap-7 overflow-hidden rounded-2xl bg-white pb-10 shadow-sheet dark:bg-neutral-900"
    >
      {hasCover ? (
        <div className="relative">
          <img src={snapshot.media.coverUrl!} alt="" className="h-36 w-full object-cover" />
          {/* شعار المؤسسة يعلو الغلاف حين يوجدان معاً: مكانه المعتاد
              على القرطاسية المطبوعة، ووضعه في متن البطاقة يجعله
              ينافس الاسم على الانتباه. */}
          {snapshot.media.logoUrl ? (
            <img
              src={snapshot.media.logoUrl}
              alt=""
              className="absolute end-4 top-4 h-9 max-w-24 rounded-sm bg-white/90 object-contain p-1.5 shadow-sheet"
            />
          ) : null}
        </div>
      ) : null}

      {!hasCover && snapshot.media.logoUrl ? (
        <div className={cn('px-6 pt-8', centered ? 'flex justify-center' : '')}>
          <img src={snapshot.media.logoUrl} alt="" className="h-8 max-w-32 object-contain" />
        </div>
      ) : null}

      <div className={cn('flex flex-col gap-7', !hasCover && !snapshot.media.logoUrl && 'pt-9')}>
        {sections.map(renderSection)}
      </div>
    </article>
  );
}

/** أيقونة الرابط. الاجتماعي يأخذ أيقونة عامة: رسم شعار كل منصّة
    داخل هذه المجموعة يعني تحديثها كلما غيّرت منصّة شعارها. */
function linkIcon(link: CardLinkData): IconName {
  switch (link.type) {
    case 'phone':
      return 'phone';
    case 'whatsapp':
      return 'phone';
    case 'email':
      return 'mail';
    case 'website':
      return 'globe';
    case 'booking':
      return 'events';
    case 'social':
    case 'custom':
    default:
      return 'link';
  }
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
