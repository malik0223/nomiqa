import type { CSSProperties } from 'react';
import type { CardLinkData, CardSection, CardSnapshot, TemplateDefinition } from '@nomiqa/contracts';
import { cn } from '../cn';
import { Icon, type IconName } from '../icon';
import { linkLabel, toHref, visibleLinks } from './link-utils';
import { surfaceStyle } from './surfaces';

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
 * شخصية القالب البصرية تأتي من `template.surface` عبر جدول الأنماط في
 * [`surfaces.ts`](./surfaces.ts) — جدول لا مكوّنات، حفاظاً على القاعدة
 * أعلاه. سطح غائب يعني `flat`: السلوك الأصلي حرفياً، فلا تتغيّر بطاقة
 * منشورة قبل وجود الأسطح.
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
  const surface = surfaceStyle(template.surface);
  const hasCover =
    template.supportsCover && Boolean(snapshot.media.coverUrl) && surface.coverMode !== 'none';

  // لون الهوية يُمرَّر كمتغيّر CSS لا كنمط سطري على كل عنصر: جدول
  // الأسطح يبقى أصنافاً خالصة، ويستطيع صنف واحد مزج اللون بشفافية.
  const accentVar = { '--nq-accent': accent } as unknown as CSSProperties;

  // ترتيب الأقسام من البطاقة إن وُجد، وإلا من القالب.
  const sections = snapshot.sectionOrder?.length > 0 ? snapshot.sectionOrder : template.sections;

  const avatarShapeClass =
    surface.avatarShape === 'circle'
      ? theme.borderRadius === 'large'
        ? 'rounded-full'
        : radius
      : surface.avatarShape === 'portrait'
        ? 'rounded-sm'
        : 'rounded-2xl';

  const renderSection = (section: CardSection) => {
    switch (section) {
      case 'identity':
        return (
          <header
            key="identity"
            className={cn(surface.header, centered ? 'items-center' : 'items-start')}
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
                  surface.avatar,
                  // `relative z-10` ليست زينة: الغلاف داخل حاوية `relative`،
                  // والعنصر المموضَع يُرسم فوق الساكن مهما كان ترتيب الـDOM،
                  // فبدونها يغطي الغلافُ الصورةَ بدل أن ترتفع هي فوقه.
                  hasCover && surface.coverMode === 'band' && '-mt-16 relative z-10',
                  avatarShapeClass,
                )}
              />
            ) : null}

            <div
              className={cn(
                'flex flex-col gap-1',
                centered ? 'items-center text-center' : 'items-start',
              )}
            >
              <h1 className={surface.name}>{content.fullName}</h1>

              {content.jobTitle ? <p className={surface.role}>{content.jobTitle}</p> : null}

              {content.organizationName ? (
                <p className={surface.org}>
                  <Icon name="building" size={14} />
                  {content.organizationName}
                  {content.department ? ` — ${content.department}` : ''}
                </p>
              ) : null}
            </div>

            {content.bio ? (
              <p
                className={cn(
                  'max-w-prose text-sm leading-7 opacity-80',
                  centered && 'text-center',
                )}
              >
                {content.bio}
              </p>
            ) : null}

            {content.addressLine ? (
              <p className={surface.meta}>
                <Icon name="globe" size={14} />
                {content.addressLine}
              </p>
            ) : null}
          </header>
        );

      case 'actions':
        if (primary.length === 0) return null;
        return (
          <section key="actions" className={cn('flex flex-col gap-2.5', surface.actionsPadding)}>
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
                  surface.primary,
                  'transition-transform duration-150 active:scale-[0.99]',
                  radius,
                )}
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
          <section key="links" className={surface.linkSection}>
            {secondary.map((link) => (
              <a
                key={link.id}
                href={toHref(link)}
                {...externalAttributes(link.type)}
                data-link-id={link.id}
                className={cn(surface.link, surface.linkLayout !== 'text' && radius)}
              >
                {surface.linkLayout === 'grid' ? (
                  <>
                    <span className={surface.linkIcon}>
                      <Icon name={linkIcon(link)} size={16} />
                    </span>
                    <span className={surface.linkLabel}>{linkLabel(link, locale)}</span>
                  </>
                ) : surface.linkLayout === 'text' ? (
                  <>
                    <span className={surface.linkLabel}>{linkLabel(link, locale)}</span>
                    {/* `bdi` لا `dir="ltr"`: العزل يكفي لعرض القيمة
                        اللاتينية بترتيبها الصحيح، بينما فرض الاتجاه كان
                        يزيحها إلى الحافة المقابلة للسطر العربي فوقها. */}
                    <bdi className={surface.linkValue}>
                      {displayValue(link.type, link.value)}
                    </bdi>
                  </>
                ) : (
                  <>
                    <span className={surface.linkIcon}>
                      <Icon name={linkIcon(link)} size={16} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className={surface.linkLabel}>{linkLabel(link, locale)}</span>
                      <bdi className={surface.linkValue}>
                        {displayValue(link.type, link.value)}
                      </bdi>
                    </span>

                    <Icon name="chevronEnd" size={16} className={surface.chevron} />
                  </>
                )}
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
    <article dir={dir} className={surface.article} style={accentVar}>
      {/* طبقات زخرفية خالصة: لا محتوى فيها ولا تلتقط مؤشراً، ويقرؤها
          الجدول لا شرطٌ لكل سطح. */}
      {surface.layers.map((layer) => (
        <div key={layer} className={layer} aria-hidden="true" />
      ))}

      {hasCover && surface.coverMode === 'fill' ? (
        <img src={snapshot.media.coverUrl!} alt="" className={surface.cover} />
      ) : null}

      {hasCover && surface.coverMode === 'band' ? (
        <div className="relative">
          <img src={snapshot.media.coverUrl!} alt="" className={surface.cover} />
          {/* شعار المؤسسة يعلو الغلاف حين يوجدان معاً: مكانه المعتاد
              على القرطاسية المطبوعة، ووضعه في متن البطاقة يجعله
              ينافس الاسم على الانتباه. */}
          {snapshot.media.logoUrl ? (
            <img src={snapshot.media.logoUrl} alt="" className={surface.logoOnCover} />
          ) : null}
        </div>
      ) : null}

      {hasCover && surface.coverMode === 'fill' && snapshot.media.logoUrl ? (
        <img src={snapshot.media.logoUrl} alt="" className={surface.logoOnCover} />
      ) : null}

      {!hasCover && snapshot.media.logoUrl ? (
        <div
          className={cn(
            surface.logoWrapper,
            centered ? 'flex justify-center' : '',
            surface.layers.length > 0 && 'relative z-10',
          )}
        >
          <img src={snapshot.media.logoUrl} alt="" className={surface.logoStandalone} />
        </div>
      ) : null}

      <div
        className={cn(
          surface.content,
          !hasCover && !snapshot.media.logoUrl && surface.contentTopPadding,
        )}
      >
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
