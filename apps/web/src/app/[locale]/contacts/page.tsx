import type { ContactStats, ContactSummary, Paginated, TagData } from '@nomiqa/contracts';
import { CONTACT_FOLLOW_UP_STATUSES } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { ApiError } from '../../../lib/api-client';
import { auth0 } from '../../../lib/auth0';
import { activeOrganizationId, fetchCards } from '../../../lib/cards';
import { fetchContactStats, fetchContacts, fetchTags } from '../../../lib/contacts';
import { Link } from '../../../i18n/routing';
import { ContactFilters } from './contact-filters';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

/**
 * قائمة جهات الاتصال.
 *
 * التصفية تعيش في الرابط لا في حالة المكوّن: صاحب البطاقة يشارك رابط
 * «كل من قابلتهم في معرض عُمان» مع زميله، ويعود إليه بعد أسبوع من
 * سجل المتصفح. حالةٌ في الذاكرة كانت ستفقد الاثنين.
 */
export default async function ContactsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations();

  const session = await auth0.getSession();
  if (!session) {
    redirect(`/${locale}`);
  }

  const page = Number(query.page ?? '1');

  let contacts: Paginated<ContactSummary>;
  let stats: ContactStats;
  let tags: TagData[];
  let cards: Array<{ id: string; fullName: string }>;

  try {
    const organizationId = await activeOrganizationId();
    const [contactsResult, statsResult, tagsResult, cardsResult] = await Promise.all([
      fetchContacts(organizationId, {
        page: Number.isFinite(page) && page > 0 ? page : 1,
        search: query.search,
        cardId: query.cardId,
        tagId: query.tagId,
        status: query.status as ContactSummary['followUpStatus'] | undefined,
        duplicates: query.duplicates as 'only' | 'exclude' | undefined,
      }),
      fetchContactStats(organizationId),
      fetchTags(organizationId),
      fetchCards(organizationId),
    ]);

    contacts = contactsResult;
    stats = statsResult;
    tags = tagsResult;
    cards = cardsResult.map((card) => ({ id: card.id, fullName: card.fullName }));
  } catch (error) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-2xl font-bold">{t('errors.generic')}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-400">
          {error instanceof ApiError ? error.message : t('errors.generic')}
        </p>
      </main>
    );
  }

  const exportHref = buildExportHref(query);

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('contacts.title')}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t('contacts.total', { count: stats.total })}
          </p>
        </div>

        {/*
          رابط لا زر: التنزيل تنقّل عادي يعمل بلا JavaScript، والمعالج
          الخادمي هو من يحمل رمز الوصول. راجع contacts/export/route.ts
        */}
        <a
          href={exportHref}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          {t('contacts.export')}
        </a>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t('contacts.stats.new')} value={stats.new} />
        <StatTile label={t('contacts.stats.inProgress')} value={stats.inProgress} />
        <StatTile label={t('contacts.stats.last7Days')} value={stats.last7Days} />
        <StatTile label={t('contacts.stats.dueFollowUps')} value={stats.dueFollowUps} />
      </section>

      <ContactFilters
        cards={cards}
        tags={tags}
        labels={{
          search: t('contacts.filters.search'),
          allCards: t('contacts.filters.allCards'),
          allTags: t('contacts.filters.allTags'),
          allStatuses: t('contacts.filters.allStatuses'),
          duplicatesOnly: t('contacts.filters.duplicatesOnly'),
          apply: t('contacts.filters.apply'),
          reset: t('contacts.filters.reset'),
          statuses: Object.fromEntries(
            CONTACT_FOLLOW_UP_STATUSES.map((status) => [status, t(`contacts.status.${status}`)]),
          ),
        }}
      />

      {contacts.data.length === 0 ? (
        <p className="mt-12 text-neutral-600 dark:text-neutral-400">{t('contacts.empty')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {contacts.data.map((contact) => (
            <li
              key={contact.id}
              className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="text-base font-semibold hover:underline"
                  >
                    {contact.fullName}
                  </Link>

                  {contact.organizationName || contact.jobTitle ? (
                    <p className="mt-0.5 truncate text-sm text-neutral-500">
                      {[contact.jobTitle, contact.organizationName].filter(Boolean).join(' — ')}
                    </p>
                  ) : null}

                  {/* البريد والهاتف بالاتجاه اللاتيني حتى في صفحة عربية. */}
                  <p className="mt-1 truncate font-mono text-xs text-neutral-500" dir="ltr">
                    {[contact.email, contact.phone].filter(Boolean).join(' · ')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {contact.isDuplicate ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      {t('contacts.duplicate')}
                    </span>
                  ) : null}

                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-800">
                    {t(`contacts.status.${contact.followUpStatus}`)}
                  </span>
                </div>
              </div>

              {contact.tags.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {contact.tags.map((tag) => (
                    <li
                      key={tag.id}
                      className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
                    >
                      {tag.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {contacts.meta.totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-between text-sm">
          <PageLink
            query={query}
            page={contacts.meta.page - 1}
            disabled={contacts.meta.page <= 1}
            label={t('contacts.previous')}
          />
          <span className="text-neutral-500">
            {t('contacts.pageOf', {
              page: contacts.meta.page,
              total: contacts.meta.totalPages,
            })}
          </span>
          <PageLink
            query={query}
            page={contacts.meta.page + 1}
            disabled={contacts.meta.page >= contacts.meta.totalPages}
            label={t('contacts.next')}
          />
        </nav>
      ) : null}
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function PageLink({
  query,
  page,
  disabled,
  label,
}: {
  query: Record<string, string | undefined>;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className="text-neutral-400">{label}</span>;
  }

  const params = new URLSearchParams(clean(query));
  params.set('page', String(page));

  return (
    <a href={`?${params.toString()}`} className="font-medium text-brand-600 hover:underline">
      {label}
    </a>
  );
}

function buildExportHref(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams(clean(query));
  // الصفحة لا معنى لها في التصدير: الملف يحمل كل ما تطابقه التصفية.
  params.delete('page');
  const serialized = params.toString();
  return `contacts/export${serialized.length > 0 ? `?${serialized}` : ''}`;
}

function clean(query: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}
