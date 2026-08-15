'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  CARD_SECTIONS,
  type CardDetail,
  type CardSection,
  type TemplateSummary,
} from '@nomiqa/contracts';
import {
  deleteCardAction,
  publishCardAction,
  saveCardAction,
  unpublishCardAction,
} from '../actions';
import { ContactFormEditor } from './contact-form-editor';
import { ImageField } from './image-field';
import { LinksEditor } from './links-editor';
import { PreviewPane } from './preview-pane';
import { ShareBox } from './share-box';
import { toFormValues, toPayload, toPreviewSnapshot, type CardFormValues } from './form-types';

/** تأخير الحفظ التلقائي. قصير بما يكفي ليُطمئن، وطويل بما يكفي ألا يحفظ كل حرف. */
const AUTOSAVE_DELAY_MS = 1500;

export function CardEditor({
  card,
  templates,
  publicUrl,
  uiLocale,
}: {
  card: CardDetail;
  templates: TemplateSummary[];
  publicUrl: string;
  uiLocale: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  const [revision, setRevision] = useState(card.revision);
  const [status, setStatus] = useState(card.status);
  const [hasUnpublished, setHasUnpublished] = useState(card.hasUnpublishedChanges);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [activeLocale, setActiveLocale] = useState<'ar' | 'en'>(
    card.defaultLocale === 'en' ? 'en' : 'ar',
  );
  const [mediaPreview, setMediaPreview] = useState(card.mediaPreview);

  const template = useMemo(
    () => templates.find((entry) => entry.key === card.templateKey) ?? templates[0],
    [templates, card.templateKey],
  );

  const { register, control, watch, getValues, setValue } = useForm<CardFormValues>({
    defaultValues: {
      ...toFormValues(card),
      // ترتيب فارغ يعني «لم يخصصه المستخدم بعد» فنبدأ من ترتيب القالب.
      sectionOrder:
        card.sectionOrder.length > 0 ? card.sectionOrder : (template?.definition.sections ?? []),
    },
  });

  const values = watch();
  const selectedTemplate = useMemo(
    () => templates.find((entry) => entry.key === values.templateKey) ?? template,
    [templates, values.templateKey, template],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (conflict) return false;

    setSaving(true);
    setError(null);

    const result = await saveCardAction(card.id, revision, toPayload(getValues()));

    setSaving(false);

    if (result.ok && result.card) {
      setRevision(result.card.revision);
      setStatus(result.card.status);
      setHasUnpublished(result.card.hasUnpublishedChanges);
      setSavedAt(new Date());
      return true;
    }

    if (result.conflict) {
      // لا نحفظ فوق تعديل غيرنا: نوقف الحفظ التلقائي ونطلب إعادة التحميل.
      setConflict(true);
      return false;
    }

    setError(result.message ?? t('errors.generic'));
    return false;
  }, [card.id, conflict, getValues, revision, t]);

  // الحفظ التلقائي: يعتمد على تسلسل القيم لا على مرجع الكائن، فـwatch
  // تُرجع كائناً جديداً في كل تصيير ويصبح التأثير حلقة لا تنتهي.
  const serialized = JSON.stringify(values);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (conflict) return;

    const timer = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [serialized, conflict, save]);

  async function handlePublish() {
    setBlockers([]);
    setError(null);

    // نحفظ أولاً: النشر يلتقط ما في قاعدة البيانات، لا ما في النموذج.
    // فشل الحفظ يعني أن ما سيُنشر ليس ما يراه المستخدم أمامه.
    if (!(await save())) return;

    const result = await publishCardAction(card.id, card.slug);

    if (result.ok && result.card) {
      setStatus(result.card.status);
      setRevision(result.card.revision);
      setHasUnpublished(result.card.hasUnpublishedChanges);
      router.refresh();
      return;
    }

    if (result.conflict) {
      setConflict(true);
      return;
    }

    // أسباب المنع تُعرض كقائمة كاملة: من يريد النشر يريد أن يعرف كل
    // ما ينقصه دفعة واحدة لا سبباً في كل محاولة.
    if (result.details && result.details.length > 0) {
      setBlockers(result.details);
      return;
    }

    setError(result.message ?? t('errors.generic'));
  }

  async function handleUnpublish() {
    const result = await unpublishCardAction(card.id, card.slug);
    if (result.ok && result.card) {
      setStatus(result.card.status);
      setHasUnpublished(result.card.hasUnpublishedChanges);
      router.refresh();
    } else {
      setError(result.message ?? t('errors.generic'));
    }
  }

  async function handleDelete() {
    const result = await deleteCardAction(card.id, card.slug);
    if (result.ok) {
      router.push(`/${uiLocale}/cards`);
    } else {
      setError(result.message ?? t('errors.generic'));
    }
  }

  const previewSnapshot = useMemo(
    () => toPreviewSnapshot(values, selectedTemplate, mediaPreview),
    [values, selectedTemplate, mediaPreview],
  );

  const contentIndex = values.content.findIndex((entry) => entry.locale === activeLocale);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t('cards.editor.title')}</h1>
          <p className="mt-1 truncate font-mono text-xs text-neutral-500" dir="ltr">
            {publicUrl}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite" className="text-xs text-neutral-500">
            {saving
              ? t('cards.editor.saving')
              : savedAt
                ? t('cards.editor.savedAt', {
                    time: savedAt.toLocaleTimeString(uiLocale === 'en' ? 'en-GB' : 'ar-OM'),
                  })
                : ''}
          </span>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || conflict}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            {t('cards.editor.save')}
          </button>

          {status === 'published' ? (
            <button
              type="button"
              onClick={() => void handleUnpublish()}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {t('cards.editor.unpublish')}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={saving || conflict}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {status === 'published' ? t('cards.editor.republish') : t('cards.editor.publish')}
          </button>
        </div>
      </header>

      {conflict ? (
        <Notice tone="warning">
          <p>{t('cards.editor.conflict')}</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-2 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {t('cards.editor.reload')}
          </button>
        </Notice>
      ) : null}

      {status === 'published' && hasUnpublished ? (
        <Notice tone="warning">{t('cards.editor.pendingChanges')}</Notice>
      ) : null}

      {blockers.length > 0 ? (
        <Notice tone="error">
          <ul className="list-disc space-y-1 ps-5">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form className="space-y-10" onSubmit={(event) => event.preventDefault()}>
          {/* ---------- المحتوى ---------- */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('cards.editor.content')}</h2>

              <div
                role="tablist"
                aria-label={t('cards.editor.contentLanguage')}
                className="inline-flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800"
              >
                {(['ar', 'en'] as const).map((locale) => (
                  <button
                    key={locale}
                    role="tab"
                    type="button"
                    aria-selected={activeLocale === locale}
                    onClick={() => setActiveLocale(locale)}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${
                      activeLocale === locale
                        ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {locale === 'ar' ? 'العربية' : 'English'}
                  </button>
                ))}
              </div>
            </div>

            {contentIndex >= 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('cards.fields.fullName')}
                  required
                  {...register(`content.${contentIndex}.fullName` as const)}
                />
                <Field
                  label={t('cards.fields.jobTitle')}
                  {...register(`content.${contentIndex}.jobTitle` as const)}
                />
                <Field
                  label={t('cards.fields.organizationName')}
                  {...register(`content.${contentIndex}.organizationName` as const)}
                />
                <Field
                  label={t('cards.fields.department')}
                  {...register(`content.${contentIndex}.department` as const)}
                />
                <Field
                  label={t('cards.fields.addressLine')}
                  className="sm:col-span-2"
                  {...register(`content.${contentIndex}.addressLine` as const)}
                />
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium">{t('cards.fields.bio')}</label>
                  <textarea
                    rows={4}
                    maxLength={600}
                    {...register(`content.${contentIndex}.bio` as const)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </div>
              </div>
            ) : null}

            <p className="text-xs text-neutral-500">{t('cards.editor.localeFallbackHint')}</p>
          </section>

          {/* ---------- الروابط ---------- */}
          <LinksEditor control={control} register={register} watchedLinks={values.links} />

          {/* ---------- نموذج التواصل ---------- */}
          <ContactFormEditor values={values.contactForm} register={register} setValue={setValue} />

          {/* ---------- الصور ---------- */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t('cards.media.title')}</h2>

            <div className="grid gap-6 sm:grid-cols-3">
              <ImageField
                purpose="avatar"
                label={t('cards.media.avatar')}
                previewUrl={mediaPreview.avatarUrl ?? null}
                onUploaded={(fileId, url) => {
                  setValue('avatarFileId', fileId, { shouldDirty: true });
                  setMediaPreview((current) => ({ ...current, avatarUrl: url }));
                }}
                onCleared={() => {
                  setValue('avatarFileId', null, { shouldDirty: true });
                  setMediaPreview((current) => ({ ...current, avatarUrl: null }));
                }}
              />

              <ImageField
                purpose="logo"
                label={t('cards.media.logo')}
                previewUrl={mediaPreview.logoUrl ?? null}
                onUploaded={(fileId, url) => {
                  setValue('logoFileId', fileId, { shouldDirty: true });
                  setMediaPreview((current) => ({ ...current, logoUrl: url }));
                }}
                onCleared={() => {
                  setValue('logoFileId', null, { shouldDirty: true });
                  setMediaPreview((current) => ({ ...current, logoUrl: null }));
                }}
              />

              <ImageField
                purpose="cover"
                label={t('cards.media.cover')}
                hint={
                  selectedTemplate?.definition.supportsCover
                    ? undefined
                    : t('cards.media.coverUnsupported')
                }
                previewUrl={mediaPreview.coverUrl ?? null}
                onUploaded={(fileId, url) => {
                  setValue('coverFileId', fileId, { shouldDirty: true });
                  setMediaPreview((current) => ({ ...current, coverUrl: url }));
                }}
                onCleared={() => {
                  setValue('coverFileId', null, { shouldDirty: true });
                  setMediaPreview((current) => ({ ...current, coverUrl: null }));
                }}
              />
            </div>
          </section>

          {/* ---------- المظهر ---------- */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t('cards.appearance.title')}</h2>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="templateKey" className="block text-sm font-medium">
                  {t('cards.fields.template')}
                </label>
                <select
                  id="templateKey"
                  {...register('templateKey')}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  {templates.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {uiLocale === 'en' ? (entry.nameEn ?? entry.name) : entry.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="primaryColor" className="block text-sm font-medium">
                  {t('cards.appearance.primaryColor')}
                </label>
                <input
                  id="primaryColor"
                  type="color"
                  {...register('theme.primaryColor')}
                  className="mt-1 h-10 w-full rounded-lg border border-neutral-300 dark:border-neutral-700"
                />
              </div>

              <div>
                <label htmlFor="borderRadius" className="block text-sm font-medium">
                  {t('cards.appearance.borderRadius')}
                </label>
                <select
                  id="borderRadius"
                  {...register('theme.borderRadius')}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="small">{t('cards.appearance.radius.small')}</option>
                  <option value="medium">{t('cards.appearance.radius.medium')}</option>
                  <option value="large">{t('cards.appearance.radius.large')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="colorScheme" className="block text-sm font-medium">
                  {t('cards.appearance.colorScheme')}
                </label>
                <select
                  id="colorScheme"
                  {...register('theme.colorScheme')}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="system">{t('cards.appearance.scheme.system')}</option>
                  <option value="light">{t('cards.appearance.scheme.light')}</option>
                  <option value="dark">{t('cards.appearance.scheme.dark')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="defaultLocale" className="block text-sm font-medium">
                  {t('cards.fields.defaultLocale')}
                </label>
                <select
                  id="defaultLocale"
                  {...register('defaultLocale')}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            <SectionOrderEditor
              order={values.sectionOrder}
              available={selectedTemplate?.definition.sections ?? [...CARD_SECTIONS]}
              onChange={(next) => setValue('sectionOrder', next, { shouldDirty: true })}
            />
          </section>

          {/* ---------- الرابط والحذف ---------- */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t('cards.editor.link')}</h2>

            <div>
              <label htmlFor="slug" className="block text-sm font-medium">
                {t('cards.fields.slug')}
              </label>
              <input
                id="slug"
                dir="ltr"
                disabled={card.publishedAt !== null}
                {...register('slug')}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm disabled:bg-neutral-100 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:disabled:bg-neutral-800"
              />
              <p className="mt-1 text-xs text-neutral-500">
                {card.publishedAt !== null
                  ? t('cards.fields.slugLocked')
                  : t('cards.fields.slugHint')}
              </p>
            </div>

            <DangerZone onDelete={() => void handleDelete()} />
          </section>
        </form>

        <aside className="space-y-6">
          {selectedTemplate ? (
            <PreviewPane snapshot={previewSnapshot} template={selectedTemplate.definition} />
          ) : null}

          {status === 'published' ? <ShareBox publicUrl={publicUrl} slug={card.slug} /> : null}
        </aside>
      </div>
    </div>
  );
}

function SectionOrderEditor({
  order,
  available,
  onChange,
}: {
  order: CardSection[];
  available: CardSection[];
  onChange: (next: CardSection[]) => void;
}) {
  const t = useTranslations();

  // الأقسام المتاحة في القالب فقط: ترتيب قسم لا يعرضه القالب وهمٌ
  // يظهر في الواجهة ولا أثر له في البطاقة.
  const effective = order.filter((section) => available.includes(section));
  const missing = available.filter((section) => !effective.includes(section));
  const list = [...effective, ...missing];

  return (
    <div>
      <span className="block text-sm font-medium">{t('cards.appearance.sectionOrder')}</span>
      <ul className="mt-2 space-y-2">
        {list.map((section, index) => (
          <li
            key={section}
            className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
          >
            <span>{t(`cards.sections.${section}`)}</span>
            <span className="flex gap-1">
              <button
                type="button"
                aria-label={t('cards.links.moveUp')}
                disabled={index === 0}
                onClick={() => {
                  const next = [...list];
                  const previous = next[index - 1];
                  const current = next[index];
                  if (!previous || !current) return;
                  next[index - 1] = current;
                  next[index] = previous;
                  onChange(next);
                }}
                className="rounded px-2 text-neutral-600 disabled:opacity-30 dark:text-neutral-400"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t('cards.links.moveDown')}
                disabled={index === list.length - 1}
                onClick={() => {
                  const next = [...list];
                  const following = next[index + 1];
                  const current = next[index];
                  if (!following || !current) return;
                  next[index + 1] = current;
                  next[index] = following;
                  onChange(next);
                }}
                className="rounded px-2 text-neutral-600 disabled:opacity-30 dark:text-neutral-400"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DangerZone({ onDelete }: { onDelete: () => void }) {
  const t = useTranslations();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-xl border border-red-200 p-4 dark:border-red-900/50">
      <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
        {t('cards.editor.deleteTitle')}
      </h3>
      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
        {t('cards.editor.deleteHint')}
      </p>

      {confirming ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            {t('cards.editor.deleteConfirm')}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400"
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          {t('cards.editor.delete')}
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  className,
  ...props
}: React.ComponentPropsWithRef<'input'> & { label: string; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium">{label}</label>
      <input
        required={required}
        {...props}
        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warning' | 'error'; children: React.ReactNode }) {
  const classes =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200'
      : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200';

  return (
    <div role="alert" className={`mt-6 rounded-xl border p-4 text-sm ${classes}`}>
      {children}
    </div>
  );
}
