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
  type WalletAvailability,
} from '@nomiqa/contracts';
import {
  Alert,
  Badge,
  Button,
  Field,
  Icon,
  Input,
  Panel,
  PanelHeader,
  Select,
  Textarea,
  cn,
} from '@nomiqa/ui';
import { deleteCardAction, publishCardAction, saveCardAction, unpublishCardAction } from '../actions';
import { ContactFormEditor } from './contact-form-editor';
import { ImageField } from './image-field';
import { LinksEditor } from './links-editor';
import { PreviewPane } from './preview-pane';
import { ShareBox } from './share-box';
import { WalletBox } from './wallet-box';
import { toFormValues, toPayload, toPreviewSnapshot, type CardFormValues } from './form-types';

/** تأخير الحفظ التلقائي. قصير بما يكفي ليُطمئن، وطويل بما يكفي ألا يحفظ كل حرف. */
const AUTOSAVE_DELAY_MS = 1500;

export function CardEditor({
  card,
  templates,
  publicUrl,
  uiLocale,
  walletAvailability,
}: {
  card: CardDetail;
  templates: TemplateSummary[];
  publicUrl: string;
  uiLocale: string;
  /** المحافظ المضبوطة على هذه المنصة (§10.2). */
  walletAvailability: WalletAvailability;
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
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      {/*
        شريط أفعال لاصق: المحرر أطول من الشاشة، والنشر آخر ما يُفعل
        بعد التمرير إلى أسفله. زرّ نشر يبقى في الأعلى وحده كان يعني
        تمريراً كاملاً للخلف قبل كل محاولة.
      */}
      <header className="sticky top-16 z-10 -mx-5 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/90 px-5 pb-4 pt-1 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-lg font-bold tracking-tight">
              {t('cards.editor.title')}
            </h1>
            <Badge tone={status === 'published' ? 'success' : 'neutral'} dot>
              {t(`cards.status.${status}`)}
            </Badge>
          </div>
          <p
            className="mt-1 truncate font-mono text-xs text-faint"
            dir="ltr"
            style={{ unicodeBidi: 'isolate' }}
          >
            {publicUrl}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite" className="text-xs text-faint">
            {saving
              ? t('cards.editor.saving')
              : savedAt
                ? t('cards.editor.savedAt', {
                    time: savedAt.toLocaleTimeString(uiLocale === 'en' ? 'en-GB' : 'ar-OM'),
                  })
                : ''}
          </span>

          <Button size="sm" onClick={() => void save()} disabled={saving || conflict}>
            {t('cards.editor.save')}
          </Button>

          {status === 'published' ? (
            <Button size="sm" variant="ghost" onClick={() => void handleUnpublish()}>
              {t('cards.editor.unpublish')}
            </Button>
          ) : null}

          <Button
            size="sm"
            variant="primary"
            icon="upload"
            onClick={() => void handlePublish()}
            disabled={saving || conflict}
          >
            {status === 'published' ? t('cards.editor.republish') : t('cards.editor.publish')}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {conflict ? (
          <Alert
            tone="warning"
            title={t('cards.editor.conflict')}
            action={
              <Button size="sm" onClick={() => router.refresh()}>
                {t('cards.editor.reload')}
              </Button>
            }
          />
        ) : null}

        {status === 'published' && hasUnpublished ? (
          <Alert tone="warning">{t('cards.editor.pendingChanges')}</Alert>
        ) : null}

        {blockers.length > 0 ? (
          <Alert tone="danger" title={t('cards.editor.blockersTitle')}>
            <ul className="list-disc space-y-1 ps-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()}>
          {/* ---------- المحتوى ---------- */}
          <Panel>
            <PanelHeader
              icon="edit"
              title={t('cards.editor.content')}
              description={t('cards.editor.localeFallbackHint')}
              actions={
                <div
                  role="tablist"
                  aria-label={t('cards.editor.contentLanguage')}
                  className="inline-flex rounded-md border border-line bg-surface-2 p-0.5"
                >
                  {(['ar', 'en'] as const).map((locale) => (
                    <button
                      key={locale}
                      role="tab"
                      type="button"
                      aria-selected={activeLocale === locale}
                      onClick={() => setActiveLocale(locale)}
                      className={cn(
                        'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
                        activeLocale === locale
                          ? 'bg-surface text-fg shadow-sheet'
                          : 'text-muted hover:text-fg',
                      )}
                    >
                      {locale === 'ar' ? 'العربية' : 'English'}
                    </button>
                  ))}
                </div>
              }
            />

            {contentIndex >= 0 ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={t('cards.fields.fullName')} required>
                  <Input required {...register(`content.${contentIndex}.fullName` as const)} />
                </Field>
                <Field label={t('cards.fields.jobTitle')}>
                  <Input {...register(`content.${contentIndex}.jobTitle` as const)} />
                </Field>
                <Field label={t('cards.fields.organizationName')}>
                  <Input {...register(`content.${contentIndex}.organizationName` as const)} />
                </Field>
                <Field label={t('cards.fields.department')}>
                  <Input {...register(`content.${contentIndex}.department` as const)} />
                </Field>
                <Field label={t('cards.fields.addressLine')} className="sm:col-span-2">
                  <Input {...register(`content.${contentIndex}.addressLine` as const)} />
                </Field>
                <Field label={t('cards.fields.bio')} className="sm:col-span-2">
                  <Textarea
                    rows={4}
                    maxLength={600}
                    {...register(`content.${contentIndex}.bio` as const)}
                  />
                </Field>
              </div>
            ) : null}
          </Panel>

          {/* ---------- الروابط ---------- */}
          <LinksEditor control={control} register={register} watchedLinks={values.links} />

          {/* ---------- نموذج التواصل ---------- */}
          <ContactFormEditor values={values.contactForm} register={register} setValue={setValue} />

          {/* ---------- الصور ---------- */}
          <Panel>
            <PanelHeader icon="upload" title={t('cards.media.title')} />

            <div className="mt-5 grid gap-6 sm:grid-cols-3">
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
          </Panel>

          {/* ---------- المظهر ---------- */}
          <Panel>
            <PanelHeader icon="branding" title={t('cards.appearance.title')} />

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Field htmlFor="templateKey" label={t('cards.fields.template')}>
                <Select id="templateKey" {...register('templateKey')}>
                  {templates.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {uiLocale === 'en' ? (entry.nameEn ?? entry.name) : entry.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="primaryColor" label={t('cards.appearance.primaryColor')}>
                <input
                  id="primaryColor"
                  type="color"
                  {...register('theme.primaryColor')}
                  className="h-10 w-full cursor-pointer rounded-md border border-line bg-surface-2 p-1"
                />
              </Field>

              <Field htmlFor="borderRadius" label={t('cards.appearance.borderRadius')}>
                <Select id="borderRadius" {...register('theme.borderRadius')}>
                  <option value="small">{t('cards.appearance.radius.small')}</option>
                  <option value="medium">{t('cards.appearance.radius.medium')}</option>
                  <option value="large">{t('cards.appearance.radius.large')}</option>
                </Select>
              </Field>

              <Field htmlFor="colorScheme" label={t('cards.appearance.colorScheme')}>
                <Select id="colorScheme" {...register('theme.colorScheme')}>
                  <option value="system">{t('cards.appearance.scheme.system')}</option>
                  <option value="light">{t('cards.appearance.scheme.light')}</option>
                  <option value="dark">{t('cards.appearance.scheme.dark')}</option>
                </Select>
              </Field>

              <Field htmlFor="defaultLocale" label={t('cards.fields.defaultLocale')}>
                <Select id="defaultLocale" {...register('defaultLocale')}>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </Select>
              </Field>
            </div>

            <SectionOrderEditor
              className="mt-6"
              order={values.sectionOrder}
              available={selectedTemplate?.definition.sections ?? [...CARD_SECTIONS]}
              onChange={(next) => setValue('sectionOrder', next, { shouldDirty: true })}
            />
          </Panel>

          {/* ---------- الرابط والحذف ---------- */}
          <Panel>
            <PanelHeader icon="link" title={t('cards.editor.link')} />

            <Field
              className="mt-5"
              htmlFor="slug"
              label={t('cards.fields.slug')}
              hint={
                card.publishedAt !== null ? t('cards.fields.slugLocked') : t('cards.fields.slugHint')
              }
            >
              <Input
                id="slug"
                dir="ltr"
                disabled={card.publishedAt !== null}
                {...register('slug')}
                className="font-mono"
              />
            </Field>
          </Panel>

          <DangerZone onDelete={() => void handleDelete()} />
        </form>

        <aside className="flex flex-col gap-6">
          {selectedTemplate ? (
            <PreviewPane snapshot={previewSnapshot} template={selectedTemplate.definition} />
          ) : null}

          {status === 'published' ? <ShareBox publicUrl={publicUrl} slug={card.slug} /> : null}

          {/*
            بعد النشر فقط: بطاقة المحفظة تحمل رمزاً يشير إلى الرابط
            العام، وإصدارها قبل النشر يضع في جيب المتلقي رمزاً معطّلاً.
          */}
          {status === 'published' ? (
            <WalletBox cardId={card.id} availability={walletAvailability} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function SectionOrderEditor({
  order,
  available,
  onChange,
  className,
}: {
  order: CardSection[];
  available: CardSection[];
  onChange: (next: CardSection[]) => void;
  className?: string;
}) {
  const t = useTranslations();

  // الأقسام المتاحة في القالب فقط: ترتيب قسم لا يعرضه القالب وهمٌ
  // يظهر في الواجهة ولا أثر له في البطاقة.
  const effective = order.filter((section) => available.includes(section));
  const missing = available.filter((section) => !effective.includes(section));
  const list = [...effective, ...missing];

  function swap(index: number, delta: number) {
    const next = [...list];
    const other = next[index + delta];
    const current = next[index];
    if (!other || !current) return;
    next[index + delta] = current;
    next[index] = other;
    onChange(next);
  }

  return (
    <div className={className}>
      <span className="block text-[0.8125rem] font-medium text-fg">
        {t('cards.appearance.sectionOrder')}
      </span>

      <ul className="mt-2.5 flex flex-col gap-2">
        {list.map((section, index) => (
          <li
            key={section}
            className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2 text-[0.8125rem]"
          >
            <span className="flex items-center gap-2.5">
              {/* الرقم يعكس الترتيب الفعلي في البطاقة، فيقرأ المستخدم
                  النتيجة لا الإجراء. */}
              <span className="nq-num w-4 text-xs font-semibold text-accent">{index + 1}</span>
              {t(`cards.sections.${section}`)}
            </span>

            <span className="flex gap-0.5">
              <button
                type="button"
                aria-label={t('cards.links.moveUp')}
                disabled={index === 0}
                onClick={() => swap(index, -1)}
                className="flex h-7 w-7 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <Icon name="chevronUp" size={15} />
              </button>
              <button
                type="button"
                aria-label={t('cards.links.moveDown')}
                disabled={index === list.length - 1}
                onClick={() => swap(index, 1)}
                className="flex h-7 w-7 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <Icon name="chevronDown" size={15} />
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
    <div className="rounded-card border border-danger-100 bg-danger-50/50 p-5 dark:border-danger-900 dark:bg-danger-900/15">
      <h3 className="font-display text-[0.9375rem] font-semibold text-danger-600 dark:text-danger-100">
        {t('cards.editor.deleteTitle')}
      </h3>
      <p className="mt-1.5 max-w-prose text-[0.8125rem] leading-6 text-muted">
        {t('cards.editor.deleteHint')}
      </p>

      {confirming ? (
        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={onDelete}
            className="bg-danger-500 hover:bg-danger-600"
          >
            {t('cards.editor.deleteConfirm')}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="danger"
          icon="trash"
          className="mt-4"
          onClick={() => setConfirming(true)}
        >
          {t('cards.editor.delete')}
        </Button>
      )}
    </div>
  );
}
