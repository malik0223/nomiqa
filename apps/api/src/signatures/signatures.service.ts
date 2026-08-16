import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_SIGNATURE_OPTIONS,
  type CardSnapshot,
  type MeetingBackgroundPayload,
  type SignatureOptions,
  type SignaturePayload,
  type SignatureTemplateKey,
  type SignatureTemplateSummary,
} from '@nomiqa/contracts';
import { withRlsContext, type TenantScopedClient } from '@nomiqa/database';
import type {
  MeetingBackgroundQueryInput,
  SignatureProfileInput,
  SignatureRenderQueryInput,
  SignatureTemplateInput,
} from '@nomiqa/validation';
import QRCode from 'qrcode';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { renderMeetingBackground } from './meeting-background.js';
import {
  DEFAULT_ACCENT_COLOR,
  renderSignature,
  type SignatureLink,
  type SignatureSource,
} from './signature-render.js';

/**
 * التوقيع وخلفيات الاجتماعات (§10.3 و§10.5).
 *
 * كلاهما **مشتق من البطاقة المنشورة لا من مسودتها**. السبب واحد في
 * الحالتين: التوقيع يُرسل إلى أطراف خارجيين والخلفية تُعرض في اجتماع،
 * وكلاهما يعرض صورة ورابطاً يجب أن يعملا للغريب. مسودة نصف مكتملة
 * تنتج توقيعاً برابط يؤدي إلى 404 — ولا يكتشفه صاحبه لأنه يفتحه وهو
 * مسجّل الدخول.
 */

/** نصوص التوقيع لكل لغة. لا ملفات ترجمة في الـAPI — أربع كلمات لا تستحق بنية. */
const SIGNATURE_LABELS = {
  ar: { viewCard: 'بطاقتي الرقمية', phone: 'هاتف', email: 'بريد', website: 'الموقع' },
  en: { viewCard: 'My digital card', phone: 'Phone', email: 'Email', website: 'Website' },
} as const;

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------
  // القوالب المؤسسية المركزية (§10.5 خطوة 2)
  // ---------------------------------------------------------------

  async listTemplates(organizationId: string): Promise<SignatureTemplateSummary[]> {
    const templates = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.signatureTemplate.findMany({ orderBy: { createdAt: 'asc' } }),
    );

    return templates.map(toTemplateSummary);
  }

  async createTemplate(
    organizationId: string,
    actorUserId: string,
    input: SignatureTemplateInput,
  ): Promise<SignatureTemplateSummary> {
    await this.requireFeature(organizationId, 'email_signature', 'توقيع البريد');

    const created = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const template = await tx.signatureTemplate.create({
        data: {
          organizationId,
          name: input.name,
          templateKey: input.templateKey,
          options: input.options as never,
          isDefault: input.isDefault,
          isEnforced: input.isEnforced,
          updatedByUserId: actorUserId,
        },
      });

      await this.demoteOthers(tx, template.id, input);

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'presence.signature_template_created',
          resourceType: 'signature_template',
          resourceId: template.id,
          outcome: 'success',
          metadata: { templateKey: input.templateKey, isEnforced: input.isEnforced },
        },
      });

      return template;
    });

    return toTemplateSummary(created);
  }

  async updateTemplate(
    organizationId: string,
    actorUserId: string,
    templateId: string,
    input: SignatureTemplateInput,
  ): Promise<SignatureTemplateSummary> {
    await this.requireFeature(organizationId, 'email_signature', 'توقيع البريد');

    const updated = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const existing = await tx.signatureTemplate.findFirst({ where: { id: templateId } });

      if (!existing) {
        throw new NotFoundException('القالب غير موجود');
      }

      const template = await tx.signatureTemplate.update({
        where: { id: templateId },
        data: {
          name: input.name,
          templateKey: input.templateKey,
          options: input.options as never,
          isDefault: input.isDefault,
          isEnforced: input.isEnforced,
          updatedByUserId: actorUserId,
        },
      });

      await this.demoteOthers(tx, templateId, input);

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'presence.signature_template_updated',
          resourceType: 'signature_template',
          resourceId: templateId,
          outcome: 'success',
        },
      });

      return template;
    });

    return toTemplateSummary(updated);
  }

  async deleteTemplate(
    organizationId: string,
    actorUserId: string,
    templateId: string,
  ): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const deleted = await tx.signatureTemplate.deleteMany({ where: { id: templateId } });

      if (deleted.count === 0) {
        throw new NotFoundException('القالب غير موجود');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'presence.signature_template_deleted',
          resourceType: 'signature_template',
          resourceId: templateId,
          outcome: 'success',
        },
      });
    });
  }

  // ---------------------------------------------------------------
  // اختيار صاحب البطاقة
  // ---------------------------------------------------------------

  /**
   * يحفظ اختيار الموظف.
   *
   * يُرفض حين تفرض المؤسسة قالباً: الفرض يعني أن التوقيع سياسة، وحفظ
   * اختيار لا يُعرض أبداً يترك الموظف يظن أنه غيّر شيئاً.
   */
  async saveProfile(
    organizationId: string,
    input: SignatureProfileInput,
  ): Promise<SignaturePayload> {
    await this.requireFeature(organizationId, 'email_signature', 'توقيع البريد');

    const enforced = await this.enforcedTemplate(organizationId);

    if (enforced) {
      throw new ConflictException('مؤسستك تفرض قالب توقيع موحّداً');
    }

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      await requireCard(tx, input.cardId);

      await tx.signatureProfile.upsert({
        where: { cardId: input.cardId },
        create: {
          cardId: input.cardId,
          organizationId,
          templateKey: input.templateKey,
          options: input.options as never,
        },
        update: { templateKey: input.templateKey, options: input.options as never },
      });
    });

    return this.render(organizationId, { cardId: input.cardId, locale: 'ar' });
  }

  /**
   * يبني التوقيع الجاهز للّصق.
   *
   * ترتيب الأولوية: قالب مفروض ← اختيار الموظف ← قالب افتراضي للمؤسسة
   * ← الافتراضي العام. الترتيب هو السياسة نفسها مكتوبةً في مكان واحد.
   */
  async render(
    organizationId: string,
    query: SignatureRenderQueryInput,
  ): Promise<SignaturePayload> {
    await this.requireFeature(organizationId, 'email_signature', 'توقيع البريد');

    const { card, snapshot } = await this.loadPublishedCard(organizationId, query.cardId);

    const [profile, enforced, fallback] = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => [
        await tx.signatureProfile.findUnique({ where: { cardId: query.cardId } }),
        await tx.signatureTemplate.findFirst({ where: { isEnforced: true } }),
        await tx.signatureTemplate.findFirst({ where: { isDefault: true } }),
      ],
    );

    const chosen = enforced ?? profile ?? fallback;

    const templateKey = (chosen?.templateKey ?? 'classic') as SignatureTemplateKey;
    const options = mergeOptions(chosen?.options);

    const source = this.toSignatureSource(card.slug, snapshot, query.locale, options);
    const { html, text } = renderSignature(templateKey, source);

    return {
      cardId: card.id,
      cardSlug: card.slug,
      templateKey,
      options,
      locale: query.locale,
      html,
      text,
      enforced: Boolean(enforced),
    };
  }

  // ---------------------------------------------------------------
  // خلفيات الاجتماعات
  // ---------------------------------------------------------------

  async meetingBackground(
    organizationId: string,
    query: MeetingBackgroundQueryInput,
  ): Promise<MeetingBackgroundPayload> {
    await this.requireFeature(organizationId, 'meeting_backgrounds', 'خلفيات الاجتماعات');

    const { card, snapshot } = await this.loadPublishedCard(organizationId, query.cardId);
    const content = pickContent(snapshot, query.locale);
    const cardUrl = this.cardUrl(card.slug, 'meeting');

    // الرمز يُضمَّن داخل الملف لا يُشار إليه برابط: الخلفية تُحوَّل إلى
    // PNG في المتصفح عبر canvas، وصورة من أصل آخر تُلوّث اللوحة فيفشل
    // التصدير — وهو فشل يظهر عند المستخدم لحظة التنزيل.
    const qrSvg = query.showQr
      ? await QRCode.toString(cardUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 })
      : null;

    const svg = renderMeetingBackground(query.platform, {
      fullName: content.fullName,
      jobTitle: content.jobTitle ?? null,
      organizationName: content.organizationName ?? null,
      cardUrl,
      qrSvg,
      logoUrl: snapshot.media.logoUrl ?? null,
      accentColor: snapshot.theme.primaryColor ?? DEFAULT_ACCENT_COLOR,
      direction: query.locale === 'ar' ? 'rtl' : 'ltr',
      scheme: query.scheme,
    });

    return {
      platform: query.platform,
      width: 1920,
      height: 1080,
      svg,
    };
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private toSignatureSource(
    slug: string,
    snapshot: CardSnapshot,
    locale: string,
    options: SignatureOptions,
  ): SignatureSource {
    const content = pickContent(snapshot, locale);
    const labels = SIGNATURE_LABELS[locale === 'en' ? 'en' : 'ar'];

    const linkOf = (type: string) => snapshot.links.find((link) => link.type === type)?.value ?? null;

    const socialLinks: SignatureLink[] = options.showSocialLinks
      ? snapshot.links
          .filter((link) => link.type === 'social')
          .map((link) => ({
            label: link.label ?? link.platform ?? 'link',
            url: link.value,
          }))
      : [];

    return {
      fullName: content.fullName,
      jobTitle: content.jobTitle ?? null,
      organizationName: content.organizationName ?? null,
      department: content.department ?? null,
      phone: linkOf('phone'),
      email: linkOf('email'),
      website: linkOf('website'),
      socialLinks,
      avatarUrl: options.showAvatar ? (snapshot.media.avatarUrl ?? null) : null,
      logoUrl: options.showLogo ? (snapshot.media.logoUrl ?? null) : null,
      cardUrl: this.cardUrl(slug, 'signature'),
      // الرمز يُشار إليه برابط عام لا يُضمَّن: Gmail يحجب `data:` في
      // الصور، وتضمينه يضاعف حجم كل رسالة تُرسل.
      qrUrl: options.showQr ? `${this.appBaseUrl()}/c/${slug}/qr?src=signature&size=288` : null,
      accentColor: options.accentColor ?? snapshot.theme.primaryColor ?? DEFAULT_ACCENT_COLOR,
      direction: locale === 'ar' ? 'rtl' : 'ltr',
      disclaimer: options.disclaimer ?? null,
      labels,
    };
  }

  /**
   * يقرأ البطاقة **من آخر لقطة منشورة**.
   *
   * لا من الجداول الحيّة: التوقيع والخلفية يعرضان صوراً وروابط يفتحها
   * غريب، والمسودة قد تحمل صورة لم تُنشر بعد — أي رابطاً خاصاً ينتهي
   * أو يُرفض عند من استلم الرسالة.
   */
  private async loadPublishedCard(
    organizationId: string,
    cardId: string,
  ): Promise<{ card: { id: string; slug: string }; snapshot: CardSnapshot }> {
    const card = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.card.findFirst({
        where: { id: cardId, deletedAt: null },
        select: {
          id: true,
          slug: true,
          status: true,
          publications: { orderBy: { publishedAt: 'desc' }, take: 1, select: { snapshot: true } },
        },
      }),
    );

    if (!card) {
      throw new NotFoundException('البطاقة غير موجودة');
    }

    const snapshot = card.publications[0]?.snapshot as CardSnapshot | undefined;

    if (card.status !== 'published' || !snapshot) {
      throw new ConflictException('انشر البطاقة أولاً — التوقيع والخلفية يعرضان رابطها العام');
    }

    return { card: { id: card.id, slug: card.slug }, snapshot };
  }

  private async enforcedTemplate(organizationId: string) {
    return withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.signatureTemplate.findFirst({ where: { isEnforced: true } }),
    );
  }

  /**
   * يبقي راية واحدة نشطة لكل نوع.
   *
   * قالبان «افتراضيان» يجعلان الاختيار تابعاً لترتيب الصفوف، وقالبان
   * «مفروضان» يجعلان سياسة المؤسسة غير محدَّدة — وكلاهما عطل صامت
   * يظهر كتوقيع مختلف بين موظفين بلا سبب مفهوم.
   */
  private async demoteOthers(
    tx: TenantScopedClient,
    keepId: string,
    input: SignatureTemplateInput,
  ): Promise<void> {
    if (input.isDefault) {
      await tx.signatureTemplate.updateMany({
        where: { id: { not: keepId }, isDefault: true },
        data: { isDefault: false },
      });
    }

    if (input.isEnforced) {
      await tx.signatureTemplate.updateMany({
        where: { id: { not: keepId }, isEnforced: true },
        data: { isEnforced: false },
      });
    }
  }

  private async requireFeature(
    organizationId: string,
    feature: 'email_signature' | 'meeting_backgrounds',
    label: string,
  ): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, feature))) {
      throw new ForbiddenException(`${label} غير متاح في باقتك الحالية`);
    }
  }

  private cardUrl(slug: string, source: 'signature' | 'meeting'): string {
    return `${this.appBaseUrl()}/${slug}?src=${source}`;
  }

  private appBaseUrl(): string {
    return (this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  }
}

// ---------------------------------------------------------------
// تحويلات
// ---------------------------------------------------------------

function toTemplateSummary(row: {
  id: string;
  name: string;
  templateKey: string;
  options: unknown;
  isDefault: boolean;
  isEnforced: boolean;
  updatedAt: Date;
}): SignatureTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    templateKey: row.templateKey as SignatureTemplateKey,
    options: mergeOptions(row.options),
    isDefault: row.isDefault,
    isEnforced: row.isEnforced,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * يدمج الخيارات المحفوظة فوق الافتراضية.
 *
 * الدمج لا الاستبدال: خيار أُضيف في إصدار لاحق يغيب عن صفوف قديمة،
 * وقراءتها كما هي كانت تُنتج `undefined` يتحول إلى «مطفأ» صامتاً.
 */
function mergeOptions(raw: unknown): SignatureOptions {
  const stored = (raw ?? {}) as Partial<SignatureOptions>;

  return {
    showQr: stored.showQr ?? DEFAULT_SIGNATURE_OPTIONS.showQr,
    showAvatar: stored.showAvatar ?? DEFAULT_SIGNATURE_OPTIONS.showAvatar,
    showLogo: stored.showLogo ?? DEFAULT_SIGNATURE_OPTIONS.showLogo,
    showSocialLinks: stored.showSocialLinks ?? DEFAULT_SIGNATURE_OPTIONS.showSocialLinks,
    accentColor: stored.accentColor ?? null,
    disclaimer: stored.disclaimer ?? null,
  };
}

/** المحتوى باللغة المطلوبة، وإلا باللغة الافتراضية للبطاقة، وإلا بأي لغة. */
function pickContent(snapshot: CardSnapshot, locale: string) {
  return (
    snapshot.content[locale] ??
    snapshot.content[snapshot.defaultLocale] ??
    Object.values(snapshot.content)[0]!
  );
}

async function requireCard(tx: TenantScopedClient, cardId: string): Promise<void> {
  const card = await tx.card.findFirst({
    where: { id: cardId, deletedAt: null },
    select: { id: true },
  });

  if (!card) {
    throw new NotFoundException('البطاقة غير موجودة');
  }
}
