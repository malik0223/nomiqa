import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OUTBOX_EVENT_TYPES,
  type CardDetail,
  type CardEntitlements,
  type CardSnapshot,
  type CardStatus,
  type CardSummary,
  type PublicCardPage,
  type TemplateDefinition,
  type TemplateSummary,
} from '@nomiqa/contracts';
import { Prisma, withRlsContext } from '@nomiqa/database';
import { slugifyName, type CreateCardInput, type UpdateCardInput } from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../files/storage.service.js';
import {
  buildSnapshot,
  parseContactForm,
  parseSectionOrder,
  parseTheme,
  publishBlockers,
} from './card-snapshot.js';
import { maxCardsFor } from './entitlements.js';

/** أعمدة الملف اللازمة لبناء رابط — لا نحمّل الصف كاملاً بلا داع. */
interface MediaFile {
  id: string;
  storageKey: string;
  mimeType: string;
  purpose: string;
}

type MediaSlot = 'avatar' | 'cover' | 'logo';

const MEDIA_SLOTS: MediaSlot[] = ['avatar', 'cover', 'logo'];

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

const PREVIEW_URL_TTL_SECONDS = 900;
const SLUG_ATTEMPTS = 6;

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------
  // قراءة
  // ---------------------------------------------------------------

  async list(organizationId: string): Promise<CardSummary[]> {
    const cards = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.card.findMany({
        where: { deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        include: {
          localizations: true,
          publications: { orderBy: { publishedAt: 'desc' }, take: 1 },
        },
      }),
    );

    return cards.map((card) => ({
      id: card.id,
      slug: card.slug,
      status: card.status as CardStatus,
      fullName:
        card.localizations.find((entry) => entry.locale === card.defaultLocale)?.fullName ??
        card.localizations[0]?.fullName ??
        '',
      templateKey: card.templateKey,
      publishedAt: card.publishedAt?.toISOString() ?? null,
      updatedAt: card.updatedAt.toISOString(),
      hasUnpublishedChanges: hasUnpublishedChanges(
        card.status,
        card.revision,
        card.publications[0]?.revision,
      ),
    }));
  }

  async get(organizationId: string, cardId: string): Promise<CardDetail> {
    const card = await this.loadCard(organizationId, cardId);
    return this.toDetail(organizationId, card);
  }

  async entitlements(organizationId: string): Promise<CardEntitlements> {
    const { organization, usedCards } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => ({
        organization: await tx.organization.findUnique({ where: { id: organizationId } }),
        usedCards: await tx.card.count({ where: { deletedAt: null } }),
      }),
    );

    if (!organization) {
      throw new NotFoundException('المؤسسة غير موجودة');
    }

    const maxCards = maxCardsFor(organization);
    return { maxCards, usedCards, canCreate: usedCards < maxCards };
  }

  /** القوالب المتاحة. مشتركة بين المؤسسات فلا تحتاج سياق RLS. */
  async listTemplates(): Promise<TemplateSummary[]> {
    const templates = await this.prisma.template.findMany({
      where: { isActive: true },
      orderBy: { key: 'asc' },
      include: { versions: true },
    });

    return templates.flatMap((template) => {
      const version = template.versions.find((entry) => entry.version === template.latestVersion);
      if (!version) {
        // قالب بلا إصدار خطأ بيانات لا حالة عمل — نتخطاه بدل إسقاط القائمة.
        this.logger.error(`القالب ${template.key} بلا إصدار ${template.latestVersion}`);
        return [];
      }

      return [
        {
          key: template.key,
          name: template.name,
          nameEn: template.nameEn,
          latestVersion: template.latestVersion,
          definition: version.definition as unknown as TemplateDefinition,
        },
      ];
    });
  }

  /**
   * هل الـslug متاح؟
   *
   * يمر عبر دالة SECURITY DEFINER لأن الفحص **عابر للمؤسسات**:
   * الرابط يظهر في الجذر فلا يجوز أن يتكرر بين مؤسستين، وRLS تحجب
   * صفوف المؤسسات الأخرى عن أي استعلام عادي.
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ taken: boolean }>>`
      SELECT card_slug_taken(${slug}) AS taken
    `;
    return rows[0]?.taken === false;
  }

  // ---------------------------------------------------------------
  // إنشاء وتعديل
  // ---------------------------------------------------------------

  async create(
    organizationId: string,
    userId: string,
    input: CreateCardInput,
    requestId?: string,
  ): Promise<CardDetail> {
    const entitlements = await this.entitlements(organizationId);
    if (!entitlements.canCreate) {
      throw new ForbiddenException(
        `بلغت حد الباقة: ${entitlements.maxCards} بطاقة. احذف بطاقة أو رقّ باقتك.`,
      );
    }

    const template = await this.requireTemplate(input.templateKey);

    // الرابط المختار صراحةً يُرفض عند التعارض؛ المولَّد يُعالج بلاحقة.
    const explicitSlug = input.slug !== undefined;
    if (explicitSlug && !(await this.isSlugAvailable(input.slug!))) {
      throw new ConflictException('هذا الرابط مستخدم، اختر رابطاً آخر');
    }

    const base = explicitSlug ? input.slug! : slugifyName(input.fullName) || 'card';

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;

      try {
        const card = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
          const created = await tx.card.create({
            data: {
              organizationId,
              ownerUserId: userId,
              slug,
              status: 'draft',
              templateKey: template.key,
              templateVersion: template.latestVersion,
              defaultLocale: input.defaultLocale,
              localizations: {
                create: { locale: input.defaultLocale, fullName: input.fullName },
              },
            },
          });

          await tx.auditLog.create({
            data: {
              organizationId,
              actorUserId: userId,
              action: 'card.created',
              resourceType: 'card',
              resourceId: created.id,
              outcome: 'success',
              requestId,
              // لا اسم ولا محتوى — البيانات الشخصية ممنوعة في السجلات (§9.4).
              metadata: { templateKey: template.key },
            },
          });

          return created;
        });

        return this.get(organizationId, card.id);
      } catch (error) {
        // الرابط سُحب بين الفحص والإدراج. الاعتماد على القيد لا على
        // الفحص المسبق مقصود: الفحص يحسّن الرسالة، والقيد هو الضمان.
        if (isUniqueViolation(error) && !explicitSlug) {
          continue;
        }
        if (isUniqueViolation(error)) {
          throw new ConflictException('هذا الرابط مستخدم، اختر رابطاً آخر');
        }
        throw error;
      }
    }

    throw new ConflictException('تعذّر توليد رابط فريد، اختر رابطاً بنفسك');
  }

  /**
   * يعدّل البطاقة.
   *
   * `revision` من العميل يجب أن يطابق المخزَّن. الحفظ التلقائي في
   * المحرر يجعل نافذتين مفتوحتين على البطاقة نفسها حالة يومية، وبلا
   * هذا الفحص يفوز آخر من حفظ ويُمحى عمل الآخر بلا إشعار (§4.5).
   */
  async update(
    organizationId: string,
    userId: string,
    cardId: string,
    input: UpdateCardInput,
  ): Promise<CardDetail> {
    const card = await this.loadCard(organizationId, cardId);

    if (card.revision !== input.revision) {
      throw new ConflictException(
        'عُدّلت البطاقة من مكان آخر. حدّث الصفحة قبل المتابعة حتى لا تُمحى تلك التعديلات.',
      );
    }

    if (input.slug !== undefined && input.slug !== card.slug) {
      // القاعدة الحرجة §7.4: الرابط ثابت بعد النشر. كل QR مطبوع وكل
      // رابط مُشارَك يشير إليه، وتغييره يكسرها كلها دفعة واحدة.
      if (card.publishedAt !== null) {
        throw new ConflictException('لا يمكن تغيير الرابط بعد النشر — الروابط المشاركة تعتمد عليه');
      }
      if (!(await this.isSlugAvailable(input.slug))) {
        throw new ConflictException('هذا الرابط مستخدم، اختر رابطاً آخر');
      }
    }

    const template =
      input.templateKey !== undefined && input.templateKey !== card.templateKey
        ? await this.requireTemplate(input.templateKey)
        : null;

    const mediaIds = await this.resolveMediaIds(organizationId, input);

    // المحتوى يجب أن يغطي اللغة الافتراضية، وإلا صارت البطاقة بلا اسم
    // في اللغة التي تُعرض بها افتراضياً.
    const defaultLocale = input.defaultLocale ?? card.defaultLocale;
    if (input.content && !input.content.some((entry) => entry.locale === defaultLocale)) {
      throw new BadRequestException('محتوى اللغة الافتراضية مطلوب');
    }

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      // شرط الإصدار داخل المعاملة: الفحص أعلاه يحسّن الرسالة، وهذا
      // هو ما يمنع فعلاً كتابتين متزامنتين من التداخل.
      const updated = await tx.card.updateMany({
        where: { id: cardId, revision: input.revision, deletedAt: null },
        data: {
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(template
            ? { templateKey: template.key, templateVersion: template.latestVersion }
            : {}),
          ...(input.defaultLocale !== undefined ? { defaultLocale: input.defaultLocale } : {}),
          ...(input.theme !== undefined
            ? { theme: (input.theme ?? Prisma.DbNull) as Prisma.InputJsonValue }
            : {}),
          ...(input.sectionOrder !== undefined
            ? { sectionOrder: (input.sectionOrder ?? Prisma.DbNull) as Prisma.InputJsonValue }
            : {}),
          ...(input.contactForm !== undefined
            ? { contactForm: input.contactForm as unknown as Prisma.InputJsonValue }
            : {}),
          ...mediaIds,
          revision: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw new ConflictException('عُدّلت البطاقة من مكان آخر. حدّث الصفحة قبل المتابعة.');
      }

      if (input.content) {
        await tx.cardLocalization.deleteMany({
          where: {
            cardId,
            locale: { notIn: input.content.map((entry) => entry.locale) },
          },
        });

        for (const entry of input.content) {
          const data = {
            fullName: entry.fullName,
            jobTitle: entry.jobTitle ?? null,
            organizationName: entry.organizationName ?? null,
            department: entry.department ?? null,
            bio: entry.bio ?? null,
            addressLine: entry.addressLine ?? null,
          };

          await tx.cardLocalization.upsert({
            where: { cardId_locale: { cardId, locale: entry.locale } },
            create: { cardId, locale: entry.locale, ...data },
            update: data,
          });
        }
      }

      if (input.links) {
        // نحافظ على معرّفات الروابط القائمة بدل حذف الكل وإعادة
        // الإنشاء: التحليلات في المرحلة 3 تُنسب النقرات إلى معرّف
        // الرابط، وإعادة الإنشاء تفقد تاريخه في كل حفظ تلقائي.
        const keptIds = input.links
          .map((link) => link.id)
          .filter((id): id is string => id !== undefined);

        await tx.cardLink.deleteMany({
          where: { cardId, ...(keptIds.length > 0 ? { id: { notIn: keptIds } } : {}) },
        });

        for (const link of input.links) {
          const data = {
            type: link.type,
            platform: link.platform ?? null,
            label: link.label ?? null,
            labelEn: link.labelEn ?? null,
            value: link.value,
            position: link.position,
            isVisible: link.isVisible,
            isPrimary: link.isPrimary,
          };

          if (link.id) {
            // updateMany لا update: القيد على cardId يمنع تمرير معرّف
            // رابط يخص بطاقة أخرى في المؤسسة نفسها.
            const result = await tx.cardLink.updateMany({
              where: { id: link.id, cardId },
              data,
            });
            if (result.count === 0) {
              throw new BadRequestException('رابط غير معروف في هذه البطاقة');
            }
          } else {
            await tx.cardLink.create({ data: { cardId, ...data } });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'card.updated',
          resourceType: 'card',
          resourceId: cardId,
          outcome: 'success',
          metadata: { fields: Object.keys(input).filter((key) => key !== 'revision') },
        },
      });
    });

    return this.get(organizationId, cardId);
  }

  // ---------------------------------------------------------------
  // دورة الحياة
  // ---------------------------------------------------------------

  /**
   * ينشر البطاقة.
   *
   * النشر يلتقط **لقطة كاملة** ويخزّنها. الصفحة العامة تُقدَّم من
   * اللقطة لا من الجداول الحيّة، فلا يرى زائر تعديلاً نصف مكتمل بينما
   * صاحب البطاقة يحرر مسودته (§6.4).
   */
  async publish(
    organizationId: string,
    userId: string,
    cardId: string,
    requestId?: string,
  ): Promise<CardDetail> {
    const card = await this.loadCard(organizationId, cardId);

    // نتحقق من وجود إصدار القالب المثبَّت قبل أي عمل: نشر لقطة تشير
    // إلى إصدار غير موجود ينتج صفحة عامة لا تُعرض إطلاقاً.
    await this.requireTemplateVersion(card.templateKey, card.templateVersion);

    // نسخ الوسائط قبل فتح المعاملة: النسخ عملية شبكة على التخزين،
    // وإبقاء معاملة قاعدة البيانات مفتوحة خلالها يحجز اتصالاً بلا داع.
    const media = await this.publishMedia(organizationId, cardId, card);

    const snapshot = buildSnapshot({
      slug: card.slug,
      templateKey: card.templateKey,
      templateVersion: card.templateVersion,
      defaultLocale: card.defaultLocale,
      theme: card.theme,
      sectionOrder: card.sectionOrder,
      localizations: card.localizations,
      links: card.links,
      media: media.urls,
      contactForm: card.contactForm,
    });

    const blockers = publishBlockers(snapshot);
    if (blockers.length > 0) {
      throw new BadRequestException({
        code: 'CARD_NOT_PUBLISHABLE',
        message: 'البطاقة غير جاهزة للنشر',
        details: blockers.map((message) => ({ field: 'card', message })),
      });
    }

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const updated = await tx.card.updateMany({
        where: { id: cardId, revision: card.revision, deletedAt: null },
        data: { status: 'published', publishedAt: new Date() },
      });

      if (updated.count === 0) {
        throw new ConflictException('عُدّلت البطاقة أثناء النشر. حدّث الصفحة وأعد المحاولة.');
      }

      await tx.cardPublication.create({
        data: {
          cardId,
          revision: card.revision,
          templateKey: card.templateKey,
          templateVersion: card.templateVersion,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          publishedBy: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'card.published',
          resourceType: 'card',
          resourceId: cardId,
          outcome: 'success',
          requestId,
          metadata: { revision: card.revision, templateKey: card.templateKey },
        },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.CARD_PUBLISHED,
          payload: { cardId, slug: card.slug, revision: card.revision },
        },
      });
    });

    // تنظيف نسخ الوسائط التي لم تعد مشار إليها — بعد نجاح النشر لا قبله.
    await this.pruneStaleMedia(cardId, media.keys);

    // تعليق تشغيلي: التخزين المؤقت للصفحة العامة يُبطَّل من الويب عبر
    // revalidateTag بعد نجاح هذا الاستدعاء، لا من هنا — الـAPI لا يعرف
    // بنية التخزين المؤقت في Next.js ولا يجب أن يعرفها.
    this.logger.log(`نُشرت البطاقة ${cardId} بالإصدار ${card.revision}`);

    return this.get(organizationId, cardId);
  }

  async unpublish(organizationId: string, userId: string, cardId: string): Promise<CardDetail> {
    const card = await this.loadCard(organizationId, cardId);

    if (card.status !== 'published') {
      throw new ConflictException('البطاقة غير منشورة أصلاً');
    }

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.card.updateMany({
        where: { id: cardId, deletedAt: null },
        data: { status: 'unpublished' },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'card.unpublished',
          resourceType: 'card',
          resourceId: cardId,
          outcome: 'success',
        },
      });
    });

    // إلغاء النشر يجب أن يُخفي الصور أيضاً: صفحة محجوبة وصورة شخصية
    // ما زالت متاحة برابط عام ليست إخفاءً.
    await this.pruneStaleMedia(cardId, []);

    return this.get(organizationId, cardId);
  }

  /** حذف ناعم. الـslug لا يُعاد استخدامه — راجع تعليق `card_slug_taken`. */
  async remove(organizationId: string, userId: string, cardId: string): Promise<void> {
    await this.loadCard(organizationId, cardId);

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await tx.card.updateMany({
        where: { id: cardId, deletedAt: null },
        data: { deletedAt: new Date(), status: 'unpublished' },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'card.deleted',
          resourceType: 'card',
          resourceId: cardId,
          outcome: 'success',
        },
      });
    });

    await this.pruneStaleMedia(cardId, []);
  }

  // ---------------------------------------------------------------
  // الصفحة العامة
  // ---------------------------------------------------------------

  /**
   * البطاقة المنشورة بالـslug، بلا مصادقة وبلا سياق مؤسسة.
   *
   * تمر عبر `public_card_by_slug` وهي دالة SECURITY DEFINER تُرجع
   * اللقطة المنشورة فقط: لا مسودات، ولا بطاقات ملغى نشرها، ولا صفاً
   * واحداً من جداول المؤسسة.
   */
  async publicBySlug(slug: string): Promise<PublicCardPage> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        card_id: string;
        slug: string;
        template_key: string;
        template_version: number;
        default_locale: string;
        snapshot: unknown;
        published_at: Date;
      }>
    >`SELECT * FROM public_card_by_slug(${slug})`;

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('البطاقة غير موجودة');
    }

    const version = await this.requireTemplateVersion(row.template_key, row.template_version);

    const snapshot = row.snapshot as CardSnapshot;

    return {
      cardId: row.card_id,
      slug: row.slug,
      snapshot,
      template: version.definition as unknown as TemplateDefinition,
      publishedAt: row.published_at.toISOString(),
    };
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private async loadCard(organizationId: string, cardId: string) {
    const card = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.card.findFirst({
        where: { id: cardId, deletedAt: null },
        include: {
          localizations: true,
          links: { orderBy: { position: 'asc' } },
          publications: { orderBy: { publishedAt: 'desc' }, take: 1 },
        },
      }),
    );

    if (!card) {
      throw new NotFoundException('البطاقة غير موجودة');
    }

    return card;
  }

  private async toDetail(
    organizationId: string,
    card: Awaited<ReturnType<CardsService['loadCard']>>,
  ): Promise<CardDetail> {
    const files = await this.loadMediaFiles(organizationId, card);

    const previewUrl = async (slot: MediaSlot) => {
      const file = files.get(slot);
      return file ? this.storage.createDownloadUrl(file.storageKey, PREVIEW_URL_TTL_SECONDS) : null;
    };

    return {
      id: card.id,
      slug: card.slug,
      status: card.status as CardStatus,
      templateKey: card.templateKey,
      templateVersion: card.templateVersion,
      defaultLocale: card.defaultLocale,
      theme: parseTheme(card.theme),
      sectionOrder: parseSectionOrder(card.sectionOrder),
      revision: card.revision,
      content: card.localizations.map((entry) => ({
        locale: entry.locale,
        fullName: entry.fullName,
        jobTitle: entry.jobTitle,
        organizationName: entry.organizationName,
        department: entry.department,
        bio: entry.bio,
        addressLine: entry.addressLine,
      })),
      links: card.links.map((link) => ({
        id: link.id,
        type: link.type as CardDetail['links'][number]['type'],
        platform: link.platform,
        label: link.label,
        labelEn: link.labelEn,
        value: link.value,
        position: link.position,
        isVisible: link.isVisible,
        isPrimary: link.isPrimary,
      })),
      contactForm: parseContactForm(card.contactForm),
      media: {
        avatarFileId: card.avatarFileId,
        coverFileId: card.coverFileId,
        logoFileId: card.logoFileId,
      },
      mediaPreview: {
        avatarUrl: await previewUrl('avatar'),
        coverUrl: await previewUrl('cover'),
        logoUrl: await previewUrl('logo'),
      },
      publishedAt: card.publishedAt?.toISOString() ?? null,
      updatedAt: card.updatedAt.toISOString(),
      hasUnpublishedChanges: hasUnpublishedChanges(
        card.status,
        card.revision,
        card.publications[0]?.revision,
      ),
    };
  }

  /** يتحقق أن كل ملف مُشار إليه يخص المؤسسة وغرضه يطابق موضعه. */
  private async resolveMediaIds(
    organizationId: string,
    input: UpdateCardInput,
  ): Promise<Partial<Record<'avatarFileId' | 'coverFileId' | 'logoFileId', string | null>>> {
    const requested: Array<[MediaSlot, 'avatarFileId' | 'coverFileId' | 'logoFileId']> = [
      ['avatar', 'avatarFileId'],
      ['cover', 'coverFileId'],
      ['logo', 'logoFileId'],
    ];

    const result: Partial<Record<'avatarFileId' | 'coverFileId' | 'logoFileId', string | null>> =
      {};

    for (const [slot, column] of requested) {
      const value = input[column];
      if (value === undefined) continue;

      if (value === null) {
        result[column] = null;
        continue;
      }

      const file = await withRlsContext(this.prisma, { organizationId }, (tx) =>
        tx.fileObject.findFirst({
          where: { id: value, deletedAt: null, status: 'uploaded' },
          select: { id: true, purpose: true },
        }),
      );

      // 400 لا 404: من منظور المستخدم هذه قيمة مرفوضة في نموذج،
      // والتفريق بين «غير موجود» و«ليس لك» يكشف وجود ملفات الآخرين.
      if (!file || file.purpose !== slot) {
        throw new BadRequestException(`ملف غير صالح للحقل ${column}`);
      }

      result[column] = value;
    }

    return result;
  }

  private async loadMediaFiles(
    organizationId: string,
    card: { avatarFileId: string | null; coverFileId: string | null; logoFileId: string | null },
  ): Promise<Map<MediaSlot, MediaFile>> {
    const ids = [card.avatarFileId, card.coverFileId, card.logoFileId].filter(
      (id): id is string => id !== null,
    );

    const map = new Map<MediaSlot, MediaFile>();
    if (ids.length === 0) {
      return map;
    }

    const files = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.fileObject.findMany({
        where: { id: { in: ids }, deletedAt: null, status: 'uploaded' },
        select: { id: true, storageKey: true, mimeType: true, purpose: true },
      }),
    );

    const byId = new Map(files.map((file) => [file.id, file]));

    for (const slot of MEDIA_SLOTS) {
      const id =
        slot === 'avatar'
          ? card.avatarFileId
          : slot === 'cover'
            ? card.coverFileId
            : card.logoFileId;
      const file = id ? byId.get(id) : undefined;
      if (file) map.set(slot, file);
    }

    return map;
  }

  /**
   * ينسخ وسائط البطاقة إلى الدلو العام ويعيد روابطها.
   *
   * المفتاح مشتق من معرّف الملف: صورة لم تتغير تُنسخ إلى المفتاح نفسه،
   * فلا يتغير رابطها ولا يُبطل تخزين CDN عند كل إعادة نشر.
   */
  private async publishMedia(
    organizationId: string,
    cardId: string,
    card: { avatarFileId: string | null; coverFileId: string | null; logoFileId: string | null },
  ): Promise<{
    urls: { avatarUrl: string | null; coverUrl: string | null; logoUrl: string | null };
    keys: string[];
  }> {
    const files = await this.loadMediaFiles(organizationId, card);
    const urls = {
      avatarUrl: null as string | null,
      coverUrl: null as string | null,
      logoUrl: null as string | null,
    };
    const keys: string[] = [];

    for (const slot of MEDIA_SLOTS) {
      const file = files.get(slot);
      if (!file) continue;

      const key = `${publicPrefix(cardId)}${slot}-${file.id}${EXTENSION_BY_MIME[file.mimeType] ?? ''}`;
      const url = await this.storage.publishObject(file.storageKey, key, file.mimeType);

      keys.push(key);
      if (slot === 'avatar') urls.avatarUrl = url;
      if (slot === 'cover') urls.coverUrl = url;
      if (slot === 'logo') urls.logoUrl = url;
    }

    return { urls, keys };
  }

  /** يحذف كل وسائط البطاقة العامة عدا ما يُشار إليه الآن. */
  private async pruneStaleMedia(cardId: string, keepKeys: string[]): Promise<void> {
    try {
      const existing = await this.storage.listPublicKeys(publicPrefix(cardId));
      const stale = existing.filter((key) => !keepKeys.includes(key));
      await this.storage.deletePublicKeys(stale);
    } catch (error) {
      // فشل التنظيف لا يبطل نشراً ناجحاً؛ يُسجَّل ويُعالج لاحقاً.
      this.logger.error(`تعذّر تنظيف وسائط البطاقة ${cardId}: ${(error as Error).message}`);
    }
  }

  private async requireTemplate(key: string) {
    const template = await this.prisma.template.findFirst({ where: { key, isActive: true } });
    if (!template) {
      throw new BadRequestException('القالب غير متاح');
    }
    return template;
  }

  private async requireTemplateVersion(key: string, version: number) {
    const templateVersion = await this.prisma.templateVersion.findUnique({
      where: { templateKey_version: { templateKey: key, version } },
    });

    if (!templateVersion) {
      // إصدار مثبَّت مفقود يعني حذف بيانات لا خطأ مستخدم.
      throw new NotFoundException('إصدار القالب غير موجود');
    }

    return templateVersion;
  }
}

function publicPrefix(cardId: string): string {
  return `cards/${cardId}/`;
}

function hasUnpublishedChanges(
  status: string,
  revision: number,
  publishedRevision: number | undefined,
): boolean {
  if (status !== 'published') return false;
  return publishedRevision === undefined || publishedRevision !== revision;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
