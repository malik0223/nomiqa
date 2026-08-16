import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CardSnapshot,
  WalletAvailability,
  WalletPassIssue,
  WalletPlatform,
} from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import type { WalletIssueInput } from '@nomiqa/validation';
import { randomBytes, randomUUID } from 'node:crypto';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildPkpass, type ApplePassIdentity } from './apple-pass.js';
import { buildGoogleSaveUrl, type GoogleWalletConfig } from './google-wallet.js';
import type { Pkcs7SignerMaterial } from './pkcs7.js';
import { solidPng } from './png.js';

/**
 * المحافظ الرقمية (§10.2).
 *
 * المنصتان مختلفتان في كل شيء إلا المبدأ: **البطاقة في المحفظة نافذة
 * على الرابط الثابت لا نسخة منه**. تحمل الاسم والمسمى ورمز QR، ولا
 * تحمل أرقاماً ولا روابط — محتواها يتجمّد عند الإصدار، وبيانات قديمة
 * في جيب المتلقي هي بالضبط ما وُجدت المنصة لتفاديه.
 *
 * والاختلاف يظهر في العقد لا يُخفى:
 *  - Google: رابط موقّع يفتحه المستخدم فتضيفه Google. بلا رحلة شبكة.
 *  - Apple: ملف `.pkpass` موقّع بـPKCS#7 يُنزَّل ويفتحه النظام.
 */

/** اللون حين لا تحدد البطاقة ولا المؤسسة لوناً. */
const DEFAULT_ACCENT = '#0f766e';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * جاهزية المنصتين.
   *
   * تُقرأ من الإعداد لا من الباقة: الواجهة تحتاج التمييز بين «ميزة لا
   * تشملها باقتك» و«لم يُضبط بعد على هذه المنصة». إخفاء زر لا تعرف
   * المؤسسة سببه أسوأ من زرّ معطّل بسبب مكتوب.
   */
  availability(): WalletAvailability {
    return { apple: this.appleMaterial() !== null, google: this.googleConfig() !== null };
  }

  /**
   * يصدر بطاقة محفظة.
   *
   * الصف يُنشأ أو يُحدَّث لا يُضاف: بطاقة واحدة لكل منصة لكل بطاقة —
   * وإلا صار لموظف واحد خمس بطاقات في محفظته لا يعرف أيها الحالية.
   * الرقم التسلسلي يبقى كما هو عبر الإصدارات، وهو ما يجعل التحديث
   * والإبطال ممكنين لاحقاً.
   */
  async issue(
    organizationId: string,
    actorUserId: string,
    input: WalletIssueInput,
  ): Promise<WalletPassIssue> {
    await this.requireFeature(organizationId);

    const { card, snapshot } = await this.loadPublishedCard(organizationId, input.cardId);

    const pass = await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const existing = await tx.walletPass.findUnique({
        where: { cardId_platform: { cardId: input.cardId, platform: input.platform } },
      });

      const row = existing
        ? await tx.walletPass.update({
            where: { id: existing.id },
            data: { issuedAt: new Date(), revokedAt: null },
          })
        : await tx.walletPass.create({
            data: {
              organizationId,
              cardId: input.cardId,
              platform: input.platform,
              serialNumber: randomUUID(),
              // رمز مصادقة خدمة التحديث. يُولَّد مرة ولا يُعرض بعدها —
              // الجهاز وحده يحمله، ونحن نقارنه فقط.
              authToken: input.platform === 'apple' ? randomBytes(24).toString('hex') : null,
            },
          });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'presence.wallet_pass_issued',
          resourceType: 'wallet_pass',
          resourceId: row.id,
          outcome: 'success',
          metadata: { platform: input.platform, cardId: input.cardId },
        },
      });

      return row;
    });

    if (input.platform === 'google') {
      const config = this.googleConfig();

      if (!config) {
        throw new ServiceUnavailableException('لم تُضبط بطاقات Google Wallet على هذه المنصة');
      }

      const saveUrl = await buildGoogleSaveUrl(config, {
        objectSuffix: pass.serialNumber.replace(/-/g, ''),
        classSuffix: this.config.get<string>('GOOGLE_WALLET_CLASS_SUFFIX') ?? 'nomiqa_card',
        ...this.passContent(card.slug, snapshot),
      });

      return {
        platform: 'google',
        serialNumber: pass.serialNumber,
        saveUrl,
        downloadPath: null,
        issuedAt: pass.issuedAt.toISOString(),
      };
    }

    if (!this.appleMaterial()) {
      throw new ServiceUnavailableException('لم تُضبط بطاقات Apple Wallet على هذه المنصة');
    }

    return {
      platform: 'apple',
      serialNumber: pass.serialNumber,
      saveUrl: null,
      // الملف يُبنى عند التنزيل لا هنا: الرد على الإصدار يجب أن يكون
      // سريعاً، وبناء الحزمة يوقّع ويضغط ويولّد صوراً.
      downloadPath: `/api/v1/wallets/${card.id}/apple`,
      issuedAt: pass.issuedAt.toISOString(),
    };
  }

  /** يبني حزمة `.pkpass` الموقّعة للتنزيل. */
  async applePkpass(
    organizationId: string,
    cardId: string,
  ): Promise<{ filename: string; body: Buffer }> {
    await this.requireFeature(organizationId);

    const material = this.appleMaterial();

    if (!material) {
      throw new ServiceUnavailableException('لم تُضبط بطاقات Apple Wallet على هذه المنصة');
    }

    const identity = this.appleIdentity();

    if (!identity) {
      throw new ServiceUnavailableException('لم يُضبط معرّف نوع البطاقة أو معرّف الفريق');
    }

    const { card, snapshot } = await this.loadPublishedCard(organizationId, cardId);

    const pass = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.walletPass.findUnique({
        where: { cardId_platform: { cardId, platform: 'apple' } },
      }),
    );

    if (!pass || pass.revokedAt) {
      throw new NotFoundException('لا توجد بطاقة Apple Wallet سارية لهذه البطاقة');
    }

    const content = this.passContent(card.slug, snapshot);
    const accent = content.accentColor;

    const body = buildPkpass(
      identity,
      {
        serialNumber: pass.serialNumber,
        authenticationToken: pass.authToken ?? '',
        ...content,
        // الأحجام التي تفرضها المواصفة: 29 نقطة، ومضاعفاتها للشاشات
        // عالية الكثافة. حزمة بأحجام أخرى تُرفض بلا رسالة مفيدة.
        images: [
          { name: 'icon.png', data: solidPng(29, accent) },
          { name: 'icon@2x.png', data: solidPng(58, accent) },
          { name: 'logo.png', data: solidPng(50, accent) },
          { name: 'logo@2x.png', data: solidPng(100, accent) },
        ],
      },
      material,
    );

    return { filename: `${card.slug}.pkpass`, body };
  }

  /**
   * يبطل بطاقة محفظة.
   *
   * لا يمحو شيئاً من جهاز أحد — لا المنصتان تسمحان بذلك. ما يفعله هو
   * إيقاف إعادة الإصدار والتحديث، وتسجيل القرار. الأثر الفعلي يظهر حين
   * تسأل المحفظة عن تحديث فلا تجد بطاقة سارية.
   */
  async revoke(
    organizationId: string,
    actorUserId: string,
    cardId: string,
    platform: WalletPlatform,
  ): Promise<void> {
    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      const updated = await tx.walletPass.updateMany({
        where: { cardId, platform, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (updated.count === 0) {
        throw new NotFoundException('لا توجد بطاقة سارية على هذه المنصة');
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: 'presence.wallet_pass_revoked',
          resourceType: 'wallet_pass',
          resourceId: cardId,
          outcome: 'success',
          metadata: { platform },
        },
      });
    });
  }

  // ---------------------------------------------------------------
  // داخلي
  // ---------------------------------------------------------------

  private passContent(slug: string, snapshot: CardSnapshot) {
    const content =
      snapshot.content[snapshot.defaultLocale] ?? Object.values(snapshot.content)[0]!;

    return {
      fullName: content.fullName,
      jobTitle: content.jobTitle ?? null,
      organizationName: content.organizationName ?? content.fullName,
      cardUrl: `${this.appBaseUrl()}/${slug}?src=wallet`,
      accentColor: snapshot.theme.primaryColor ?? DEFAULT_ACCENT,
      logoUrl: snapshot.media.logoUrl ?? null,
      locale: (snapshot.defaultLocale === 'en' ? 'en' : 'ar') as 'ar' | 'en',
    };
  }

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
      throw new ConflictException('انشر البطاقة أولاً — بطاقة المحفظة تشير إلى رابطها العام');
    }

    return { card: { id: card.id, slug: card.slug }, snapshot };
  }

  private async requireFeature(organizationId: string): Promise<void> {
    if (!(await this.entitlements.hasFeature(organizationId, 'wallet_passes'))) {
      throw new ForbiddenException('بطاقات المحافظ غير متاحة في باقتك الحالية');
    }
  }

  /**
   * مواد توقيع Apple من البيئة.
   *
   * تُقرأ عند كل استدعاء لا مرة واحدة عند الإقلاع: تدوير شهادة منتهية
   * يجب ألا يتطلب إعادة نشر، والقراءة من متغير بيئة رخيصة.
   */
  private appleMaterial(): Pkcs7SignerMaterial | null {
    const certificatePem = decodePem(this.config.get<string>('APPLE_WALLET_CERT_PEM'));
    const privateKeyPem = decodePem(this.config.get<string>('APPLE_WALLET_KEY_PEM'));
    const wwdrPem = decodePem(this.config.get<string>('APPLE_WALLET_WWDR_PEM'));

    if (!certificatePem || !privateKeyPem || !wwdrPem) {
      return null;
    }

    return {
      certificatePem,
      privateKeyPem,
      wwdrPem,
      passphrase: this.config.get<string>('APPLE_WALLET_KEY_PASSPHRASE') || undefined,
    };
  }

  private appleIdentity(): ApplePassIdentity | null {
    const passTypeIdentifier = this.config.get<string>('APPLE_WALLET_PASS_TYPE_ID');
    const teamIdentifier = this.config.get<string>('APPLE_WALLET_TEAM_ID');

    if (!passTypeIdentifier || !teamIdentifier) {
      return null;
    }

    return { passTypeIdentifier, teamIdentifier };
  }

  private googleConfig(): GoogleWalletConfig | null {
    const issuerId = this.config.get<string>('GOOGLE_WALLET_ISSUER_ID');
    const serviceAccountEmail = this.config.get<string>('GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL');
    const privateKeyPem = decodePem(this.config.get<string>('GOOGLE_WALLET_PRIVATE_KEY'));

    if (!issuerId || !serviceAccountEmail || !privateKeyPem) {
      return null;
    }

    return { issuerId, serviceAccountEmail, privateKeyPem, origin: this.appBaseUrl() };
  }

  private appBaseUrl(): string {
    return (this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  }
}

/**
 * يقرأ مفتاحاً أو شهادة من متغير بيئة.
 *
 * الشهادات نصوص متعددة الأسطر، وأنظمة الأسرار تنقلها إما بـ`\n` حرفية
 * أو مرمَّزة Base64. الصيغتان مقبولتان هنا لأن رفض إحداهما يظهر كخطأ
 * توقيع غامض بعد النشر لا كخطأ إعداد عند الإقلاع.
 */
function decodePem(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  if (raw.includes('-----BEGIN')) {
    return raw.replace(/\\n/g, '\n');
  }

  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  return decoded.includes('-----BEGIN') ? decoded : undefined;
}
