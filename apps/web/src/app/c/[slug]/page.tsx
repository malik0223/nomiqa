import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CardRenderer } from '@nomiqa/ui';
import { fetchPublicCard, publicCardUrl } from '../../../lib/cards';
import { AnalyticsBeacon } from './analytics-beacon';
import { ContactForm } from './contact-form';
import { PublicCardActions } from './public-card-actions';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string; src?: string }>;
}

/**
 * الصفحة العامة للبطاقة.
 *
 * الشرط غير القابل للتفاوض (§7.5): **تُفتح دون تسجيل ودون تطبيق**.
 * ولذلك:
 *  - مكوّن خادمي بالكامل عدا زر مشاركة واحد صغير.
 *  - يُقدَّم من لقطة منشورة مخزَّنة، لا من الجداول الحيّة.
 *  - كل وسيلة تواصل رابط أصلي (`tel:` و`mailto:` وwa.me) يفتحه الهاتف
 *    مباشرة بلا وسيط.
 */
export default async function PublicCardPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { lang, src } = await searchParams;

  const card = await fetchPublicCard(slug);
  if (!card) {
    notFound();
  }

  const available = Object.keys(card.snapshot.content);
  // اللغة المطلوبة إن كانت متاحة فعلاً، وإلا لغة البطاقة الافتراضية.
  const locale = lang && available.includes(lang) ? lang : card.snapshot.defaultLocale;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const otherLocale = available.find((entry) => entry !== locale);
  const contactForm = card.snapshot.contactForm;

  return (
    <main lang={locale} dir={dir}>
      <CardRenderer snapshot={card.snapshot} template={card.template} locale={locale} />

      <PublicCardActions
        slug={slug}
        publicUrl={publicCardUrl(slug)}
        locale={locale}
        otherLocale={otherLocale ?? null}
        name={card.snapshot.content[locale]?.fullName ?? slug}
      />

      {/*
        النموذج يُرسم من اللقطة لا من إعداد البطاقة الحيّ: تفعيله قرار
        نشر كبقية محتوى البطاقة، فلا يظهر للزوار قبل أن ينشره صاحبه.
      */}
      {contactForm?.enabled ? <ContactForm slug={slug} locale={locale} form={contactForm} /> : null}

      <AnalyticsBeacon slug={slug} locale={locale} apiUrl={API_URL} fromQr={src === 'qr'} />
    </main>
  );
}

/**
 * بطاقات المعاينة للشبكات الاجتماعية.
 *
 * §7.4: معاينة الرابط في واتساب هي أول ما يراه المستلم — رابط بلا
 * معاينة يبدو مشبوهاً، ويقلّ فتحه.
 */
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { lang } = await searchParams;

  const card = await fetchPublicCard(slug);
  if (!card) {
    return { title: 'Nomiqa' };
  }

  const locale = lang && card.snapshot.content[lang] ? lang : card.snapshot.defaultLocale;
  const content = card.snapshot.content[locale] ?? Object.values(card.snapshot.content)[0];

  if (!content) {
    return { title: 'Nomiqa' };
  }

  const title = content.jobTitle ? `${content.fullName} — ${content.jobTitle}` : content.fullName;
  const description =
    content.bio ?? [content.jobTitle, content.organizationName].filter(Boolean).join(' · ');
  const image = card.snapshot.media.avatarUrl ?? card.snapshot.media.coverUrl;
  const url = publicCardUrl(slug);

  return {
    title,
    description: description || undefined,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      title,
      description: description || undefined,
      url,
      locale,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description: description || undefined,
      ...(image ? { images: [image] } : {}),
    },
    robots: { index: true, follow: true },
  };
}
