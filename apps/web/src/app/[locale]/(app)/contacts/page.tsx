import type { ContactStats, ContactSummary, Paginated, TagData } from '@nomiqa/contracts';
import { CONTACT_FOLLOW_UP_STATUSES } from '@nomiqa/contracts';
import {
  Alert,
  Avatar,
  Badge,
  EmptyState,
  Icon,
  PageBody,
  PageHeader,
  Panel,
  Stat,
  buttonClasses,
  type BadgeTone,
} from '@nomiqa/ui';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@/lib/api-client';
import { activeOrganizationId, fetchCards } from '@/lib/cards';
import { fetchContactStats, fetchContacts, fetchTags } from '@/lib/contacts';
import { Link } from '@/i18n/routing';
import { ContactFilters } from './contact-filters';
import { formatDate } from '@/lib/format';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

/** لون حالة المتابعة. الحالة معلومة عمل لا زينة: «جديدة» تعني أن أحداً
    لم يتواصل بعد، و«متأخرة» تعني وعداً فات موعده. */
const statusTone: Record<string, BadgeTone> = {
  new: 'gold',
  in_progress: 'ink',
  done: 'success',
  archived: 'neutral',
};

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
      <PageBody width="narrow">
        <PageHeader title={t('errors.generic')} />
        <Alert tone="danger">{error instanceof ApiError ? error.message : t('errors.generic')}</Alert>
      </PageBody>
    );
  }

  const exportHref = buildExportHref(query);

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('nav.groups.relations')}
        title={t('contacts.title')}
        description={t('contacts.total', { count: stats.total })}
        actions={
          /*
            رابط لا زر: التنزيل تنقّل عادي يعمل بلا JavaScript، والمعالج
            الخادمي هو من يحمل رمز الوصول. راجع contacts/export/route.ts
          */
          <a href={exportHref} className={buttonClasses({ variant: 'secondary' })}>
            <Icon name="download" size={16} />
            {t('contacts.export')}
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="seal" label={t('contacts.stats.new')} value={stats.new} />
        <Stat icon="refresh" label={t('contacts.stats.inProgress')} value={stats.inProgress} />
        <Stat icon="clock" label={t('contacts.stats.last7Days')} value={stats.last7Days} />
        <Stat
          featured={stats.dueFollowUps > 0}
          icon="alert"
          label={t('contacts.stats.dueFollowUps')}
          value={stats.dueFollowUps}
        />
      </div>

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
        <EmptyState icon="contacts" title={t('contacts.empty')} description={t('contacts.emptyHint')} />
      ) : (
        <Panel bare>
          <ul className="divide-y divide-line">
            {contacts.data.map((contact) => (
              <li key={contact.id}>
                <Link
                  href={`/contacts/${contact.id}`}
                  className="flex items-start gap-4 p-4 transition-colors hover:bg-surface-2/60"
                >
                  <Avatar name={contact.fullName} size="sm" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{contact.fullName}</span>

                      {contact.isDuplicate ? (
                        <Badge tone="warning">{t('contacts.duplicate')}</Badge>
                      ) : null}
                    </div>

                    {contact.organizationName || contact.jobTitle ? (
                      <p className="mt-0.5 truncate text-[0.8125rem] text-muted">
                        {[contact.jobTitle, contact.organizationName].filter(Boolean).join(' — ')}
                      </p>
                    ) : null}

                    {/* البريد والهاتف بالاتجاه اللاتيني حتى في صفحة عربية. */}
                    <p
                      className="mt-1 truncate font-mono text-xs text-faint"
                      dir="ltr"
                      style={{ unicodeBidi: 'isolate' }}
                    >
                      {[contact.email, contact.phone].filter(Boolean).join(' · ')}
                    </p>

                    {contact.tags.length > 0 ? (
                      <ul className="mt-2.5 flex flex-wrap gap-1.5">
                        {contact.tags.map((tag) => (
                          <li key={tag.id}>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: tag.color ?? 'var(--nq-faint)' }}
                              />
                              {tag.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={statusTone[contact.followUpStatus] ?? 'neutral'} dot>
                      {t(`contacts.status.${contact.followUpStatus}`)}
                    </Badge>
                    <time dateTime={contact.capturedAt} className="nq-num text-xs text-faint">
                      {formatDate(contact.capturedAt, locale)}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {contacts.meta.totalPages > 1 ? (
        <nav className="flex items-center justify-between text-sm">
          <PageLink
            query={query}
            page={contacts.meta.page - 1}
            disabled={contacts.meta.page <= 1}
            label={t('contacts.previous')}
          />
          <span className="nq-num text-xs text-faint">
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
    </PageBody>
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
    return <span className="text-sm text-faint opacity-50">{label}</span>;
  }

  const params = new URLSearchParams(clean(query));
  params.set('page', String(page));

  return (
    <a href={`?${params.toString()}`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
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
