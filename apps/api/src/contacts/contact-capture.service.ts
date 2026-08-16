import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ACCEPTED_CONTACT_CONSENT_VERSIONS,
  OUTBOX_EVENT_TYPES,
  type CardContactForm,
  type ContactSubmissionResult,
} from '@nomiqa/contracts';
import { Prisma, withRlsContext } from '@nomiqa/database';
import { normalizeEmail, normalizePhone, type ContactSubmissionInput } from '@nomiqa/validation';
import { parseContactForm } from '../cards/card-snapshot.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** وجهة النموذج كما تُرجعها الدالة الآمنة في قاعدة البيانات. */
interface ContactTarget {
  card_id: string;
  organization_id: string;
  owner_user_id: string;
  contact_form: unknown;
}

const CONFIRMATION_MESSAGES: Record<string, string> = {
  ar: 'وصلت بياناتك. شكراً لك.',
  en: 'Your details were received. Thank you.',
};

/**
 * التقاط جهة اتصال من النموذج العام.
 *
 * هذا **المسار الوحيد في المنصة الذي يكتب صفاً بمدخل من مجهول**، فهو
 * موضع الخطر الأعلى. الضوابط الأربعة التي تحكمه:
 *
 *  1. المؤسسة تُشتق من الـslug عبر دالة قاعدة بيانات، **لا تُرسل من
 *     العميل**. لو قبلناها من الطلب لصار بوسع أي أحد كتابة صف في
 *     مؤسسة يختارها.
 *  2. الحقول المقبولة تُقاس على إعداد البطاقة نفسها؛ حقل لم يُفعَّل
 *     يُرفض ولا يُتجاهَل صامتاً.
 *  3. الحفظ والموافقة في Transaction واحدة — لا صف بيانات شخصية بلا
 *     سند موافقة، ولو تعطّل شيء في المنتصف.
 *  4. الاستجابة لا تكشف شيئاً: لا معرّف الصف ولا وجود تكرار سابق.
 */
@Injectable()
export class ContactCaptureService {
  private readonly logger = new Logger(ContactCaptureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submit(
    slug: string,
    input: ContactSubmissionInput,
    context: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<ContactSubmissionResult> {
    const accepted: ContactSubmissionResult = {
      accepted: true,
      message: CONFIRMATION_MESSAGES[input.locale] ?? CONFIRMATION_MESSAGES.ar!,
    };

    // مصيدة الروبوتات: حقل مخفي عن البشر. امتلاؤه دليل إرسال آلي.
    // نردّ بنجاح ظاهري ولا نكتب — الرد بخطأ يعلّم الروبوت تجنّبها.
    if (input.website !== undefined && input.website.trim().length > 0) {
      this.logger.warn(`إرسال آلي مرفوض على البطاقة ${slug}`);
      return accepted;
    }

    // إصدار نص الموافقة يأتي من العميل لأن الصفحة مخزَّنة مؤقتاً وقد
    // تعرض نصاً سابقاً؛ لكن القائمة مغلقة، فلا يستطيع مرسِلٌ أن يكتب
    // في السجل القانوني إصداراً من عنده.
    if (!ACCEPTED_CONTACT_CONSENT_VERSIONS.includes(input.consentTextVersion)) {
      throw new BadRequestException({
        code: 'CONSENT_VERSION_UNKNOWN',
        message: 'حدّث الصفحة ثم أعد الإرسال',
        details: [{ field: 'consentTextVersion', message: 'إصدار نص موافقة غير معروف' }],
      });
    }

    const target = await this.resolveTarget(slug);
    const form = parseContactForm(target.contact_form);

    if (!form.enabled) {
      // 404 لا 403: النموذج غير موجود من منظور الزائر، ولا داعي
      // لإخباره أن البطاقة موجودة لكن النموذج مغلق.
      throw new NotFoundException('نموذج التواصل غير متاح لهذه البطاقة');
    }

    const customFields = this.validateAgainstForm(form, input);

    const emailNormalized = normalizeEmail(input.email);
    const phoneNormalized = normalizePhone(input.phone);
    const organizationId = target.organization_id;

    const duplicateOfId = await this.findDuplicate(
      organizationId,
      emailNormalized,
      phoneNormalized,
    );

    await withRlsContext(this.prisma, { organizationId }, async (tx) => {
      // إسناد الفعالية (§11.3): يُشتق من **البطاقة ونافذتها الزمنية**
      // لا من مدخل الزائر — نفس مبدأ اشتقاق المؤسسة من الـslug واشتقاق
      // الحملة من كودها (القاعدة 17). الدالة تعيش في قاعدة البيانات
      // لأن الشرط نفسه يُقرأ من مسارات أخرى، ونسختان منه كانتا
      // ستفترقان أول مرة يُعدَّل أحدهما.
      const [attribution] = await tx.$queryRaw<Array<{ card_event_at: string | null }>>`
        SELECT card_event_at(${target.card_id}::uuid, now())
      `;

      const contact = await tx.contact.create({
        data: {
          organizationId,
          cardId: target.card_id,
          eventId: attribution?.card_event_at ?? null,
          // مالك البطاقة هو مالك العميل المحتمل: هو من وُضع رابطه على
          // ما وُزّع في المعرض، وهو من يتابع. أساس مقارنة أداء الفريق.
          ownerUserId: target.owner_user_id,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          organizationName: input.organizationName ?? null,
          jobTitle: input.jobTitle ?? null,
          message: input.message ?? null,
          customFields:
            Object.keys(customFields).length > 0
              ? (customFields as Prisma.InputJsonValue)
              : Prisma.DbNull,
          source: 'card_form',
          locale: input.locale,
          emailNormalized,
          phoneNormalized,
          duplicateOfId,
        },
      });

      // الموافقة في نفس الـTransaction — لا صف بيانات شخصية بلا سندها.
      const consents: Prisma.ContactConsentCreateManyInput[] = [
        {
          organizationId,
          contactId: contact.id,
          purpose: 'contact_storage',
          granted: true,
          consentTextVersion: input.consentTextVersion,
          source: 'public_form',
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent?.slice(0, 500) ?? null,
        },
      ];

      // الموافقة التسويقية تُسجَّل بقيمتها أياً كانت: «لم يوافق» إثبات
      // مطلوب تماماً كـ«وافق»، وغيابه يجعلنا بلا سند عند الاستفسار.
      consents.push({
        organizationId,
        contactId: contact.id,
        purpose: 'marketing',
        granted: input.marketingConsent,
        consentTextVersion: input.consentTextVersion,
        source: 'public_form',
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent?.slice(0, 500) ?? null,
      });

      await tx.contactConsent.createMany({ data: consents });

      // الحدث يحمل معرّفات فقط. اسم الزائر وبريده يُقرآن لاحقاً من
      // الصف داخل سياق مؤسسته، فلا تمرّ بيانات شخصية عبر Redis في
      // حمولة الحدث ولا تبقى في سجل الـOutbox.
      await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: OUTBOX_EVENT_TYPES.CONTACT_CAPTURED,
          payload: {
            contactId: contact.id,
            cardId: target.card_id,
            ownerUserId: target.owner_user_id,
            locale: input.locale,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          // الفاعل زائر مجهول — لا مستخدم في المنصة.
          actorUserId: null,
          action: 'contact.captured',
          resourceType: 'contact',
          resourceId: contact.id,
          outcome: 'success',
          requestId: context.requestId,
          ipAddress: context.ipAddress,
          // لا اسم ولا بريد ولا رسالة — بيانات شخصية ممنوعة في السجلات.
          metadata: { source: 'card_form', isDuplicate: duplicateOfId !== null },
        },
      });
    });

    return accepted;
  }

  /**
   * يترجم الـslug إلى مؤسسته.
   *
   * عبر دالة SECURITY DEFINER: الزائر بلا سياق مؤسسة، وRLS تحجب عنه
   * كل صف. الدالة تُرجع بطاقة **منشورة** فقط.
   */
  private async resolveTarget(slug: string): Promise<ContactTarget> {
    const rows = await this.prisma.$queryRaw<ContactTarget[]>`
      SELECT * FROM public_card_contact_target(${slug})
    `;

    const target = rows[0];
    if (!target) {
      throw new NotFoundException('البطاقة غير موجودة');
    }

    return target;
  }

  /**
   * يطابق المدخل بإعداد النموذج.
   *
   * الاتجاهان مقصودان: الحقل المطلوب لا بد أن يصل، والحقل غير المفعَّل
   * لا يُقبل حتى لو وصل. تجاهل الزائد بدل رفضه يعني قبول بيانات لم
   * يطلبها صاحب البطاقة ولم يخبر الزائر أنه يجمعها.
   */
  private validateAgainstForm(
    form: CardContactForm,
    input: ContactSubmissionInput,
  ): Record<string, string> {
    const details: Array<{ field: string; message: string }> = [];
    const enabled = new Map(form.fields.map((field) => [field.key, field]));

    for (const key of ['email', 'phone', 'organizationName', 'jobTitle', 'message'] as const) {
      const value = input[key];
      const field = enabled.get(key);

      if (!field) {
        if (value !== undefined && value !== null) {
          details.push({ field: key, message: 'هذا الحقل غير مفعّل في النموذج' });
        }
        continue;
      }

      if (field.required && (value === undefined || value === null)) {
        details.push({ field: key, message: 'هذا الحقل مطلوب' });
      }
    }

    const allowed = new Map(form.customFields.map((field) => [field.key, field]));
    const customFields: Record<string, string> = {};

    for (const [key, value] of Object.entries(input.customFields)) {
      if (!allowed.has(key)) {
        details.push({ field: `customFields.${key}`, message: 'حقل غير معروف في هذا النموذج' });
        continue;
      }
      if (value.length > 0) {
        customFields[key] = value;
      }
    }

    for (const field of form.customFields) {
      if (field.required && !customFields[field.key]) {
        details.push({ field: `customFields.${field.key}`, message: 'هذا الحقل مطلوب' });
      }
    }

    if (details.length > 0) {
      throw new BadRequestException({
        code: 'CONTACT_FORM_MISMATCH',
        message: 'تعذّر إرسال النموذج',
        details,
      });
    }

    return customFields;
  }

  /**
   * أول جهة اتصال تطابق البريد أو الهاتف.
   *
   * **وسم لا منع**: التقاء ثانٍ بالشخص نفسه أمر طبيعي في المعارض،
   * ورفض الإرسال لأنه «مكرر» يفقد صاحب البطاقة سياق اللقاء الثاني
   * كاملاً. نسلسل الوسم إلى الأصل حتى لا تتشكل سلاسل تكرار.
   */
  private async findDuplicate(
    organizationId: string,
    emailNormalized: string | null,
    phoneNormalized: string | null,
  ): Promise<string | null> {
    if (!emailNormalized && !phoneNormalized) {
      return null;
    }

    const match = await withRlsContext(this.prisma, { organizationId }, (tx) =>
      tx.contact.findFirst({
        where: {
          deletedAt: null,
          OR: [
            ...(emailNormalized ? [{ emailNormalized }] : []),
            ...(phoneNormalized ? [{ phoneNormalized }] : []),
          ],
        },
        orderBy: { capturedAt: 'asc' },
        select: { id: true, duplicateOfId: true },
      }),
    );

    if (!match) return null;
    return match.duplicateOfId ?? match.id;
  }
}
