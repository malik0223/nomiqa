import type { ContactDetail, TagData } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api-client';
import { activeOrganizationId } from '@/lib/cards';
import { fetchContact, fetchTags } from '@/lib/contacts';
import { Link } from '@/i18n/routing';
import { ContactWorkspace } from './contact-workspace';
import { formatDate, formatDateTime } from '@/lib/format';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function ContactPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations();

  let contact: ContactDetail;
  let tags: TagData[];

  try {
    const organizationId = await activeOrganizationId();
    [contact, tags] = await Promise.all([
      fetchContact(organizationId, id),
      fetchTags(organizationId),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="font-display text-2xl font-bold tracking-tight">{t('errors.generic')}</h1>
        <p className="mt-4 text-muted">
          {error instanceof ApiError ? error.message : t('errors.generic')}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/contacts" className="text-sm text-faint hover:underline">
        ← {t('contacts.title')}
      </Link>

      <header className="mt-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">{contact.fullName}</h1>
        {contact.organizationName || contact.jobTitle ? (
          <p className="mt-1 text-muted">
            {[contact.jobTitle, contact.organizationName].filter(Boolean).join(' — ')}
          </p>
        ) : null}
      </header>

      <section className="mt-6 rounded-card border border-line p-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label={t('contacts.fields.email')} value={contact.email} ltr />
          <Detail label={t('contacts.fields.phone')} value={contact.phone} ltr />
          <Detail
            label={t('contacts.fields.source')}
            value={t(`contacts.sources.${contact.source}`)}
          />
          <Detail
            label={t('contacts.fields.capturedAt')}
            value={formatDateTime(contact.capturedAt, locale)}
          />
          {contact.cardSlug ? (
            <Detail label={t('contacts.fields.card')} value={contact.cardSlug} ltr />
          ) : null}
        </dl>

        {contact.message ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-xs text-faint">{t('contacts.fields.message')}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-7">{contact.message}</p>
          </div>
        ) : null}

        {Object.keys(contact.customFields).length > 0 ? (
          <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            {Object.entries(contact.customFields).map(([key, value]) => (
              <Detail key={key} label={key} value={value} />
            ))}
          </dl>
        ) : null}
      </section>

      {/*
        سجل الموافقة يُعرض لصاحب البطاقة عمداً: هو المسؤول عن هذه
        البيانات أمام صاحبها، وإخفاء سند حفظها عنه يجعله لا يعرف على
        أي أساس يحتفظ بها.
      */}
      <section className="mt-4 rounded-card border border-line p-5 text-sm">
        <h2 className="font-semibold">{t('contacts.consents.title')}</h2>
        <ul className="mt-3 space-y-2">
          {contact.consents.map((consent) => (
            <li
              key={consent.id}
              className="flex flex-wrap items-center gap-2 text-muted"
            >
              <span>{t(`contacts.consents.${consent.purpose}`)}</span>
              <span
                className={
                  consent.granted
                    ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'rounded-full bg-surface-2 px-2 py-0.5 text-xs'
                }
              >
                {consent.granted ? t('contacts.consents.granted') : t('contacts.consents.refused')}
              </span>
              <span className="font-mono text-xs text-faint" dir="ltr">
                {consent.consentTextVersion} ·{' '}
                {formatDate(consent.createdAt, locale)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <ContactWorkspace
        contact={contact}
        tags={tags}
        locale={locale}
        labels={{
          status: t('contacts.fields.status'),
          statuses: {
            new: t('contacts.status.new'),
            in_progress: t('contacts.status.in_progress'),
            done: t('contacts.status.done'),
            archived: t('contacts.status.archived'),
          },
          tags: t('contacts.tags.title'),
          newTag: t('contacts.tags.create'),
          notes: t('contacts.notes.title'),
          notePlaceholder: t('contacts.notes.placeholder'),
          addNote: t('contacts.notes.add'),
          removeNote: t('contacts.notes.remove'),
          followUps: t('contacts.followUps.title'),
          followUpTitle: t('contacts.followUps.titleField'),
          followUpDue: t('contacts.followUps.dueField'),
          addFollowUp: t('contacts.followUps.add'),
          completeFollowUp: t('contacts.followUps.complete'),
          done: t('contacts.followUps.done'),
          saving: t('common.loading'),
          deleteContact: t('contacts.delete'),
          deleteConfirm: t('contacts.deleteConfirm'),
          error: t('errors.generic'),
        }}
      />
    </main>
  );
}

function Detail({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string | null;
  ltr?: boolean;
}) {
  if (!value) return null;

  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd
        className={ltr ? 'mt-0.5 font-mono text-sm' : 'mt-0.5 text-sm'}
        dir={ltr ? 'ltr' : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
