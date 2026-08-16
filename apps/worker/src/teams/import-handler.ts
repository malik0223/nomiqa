import { createHash, randomBytes } from 'node:crypto';
import {
  EMAIL_TEMPLATES,
  type EmployeeImportJobData,
  type EmployeeImportRow,
  type ImportRowError,
} from '@nomiqa/contracts';
import { getPrismaClient, withRlsContext } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';
import type { Job } from 'bullmq';
import { enqueueEmail, idempotencyKeyFrom } from '../email/producer.js';

const prisma = getPrismaClient();
const logger = createLogger('employee-import');

/** صلاحية الدعوة — تطابق ما يستخدمه الـAPI. */
const INVITATION_TTL_DAYS = 14;

/**
 * تنفيذ دفعة استيراد الموظفين (خارطة الطريق §9.2).
 *
 * **Idempotent صفاً صفاً لا دفعةً واحدة.** إعادة المحاولة بعد فشل في
 * منتصف الدفعة هي الحالة المتوقعة، ودفعة بخمسمئة موظف تُعاد من أولها
 * يجب ألا تُرسل خمسمئة دعوة ثانية. الضمان يأتي من ثلاثة أمور:
 *
 *   1. العضو الموجود يُحدَّث ولا يُدعى.
 *   2. الدعوة المعلّقة لنفس البريد تُعاد كما هي بلا رمز جديد.
 *   3. مفتاح البريد الاصطلاحي مشتق من معرّف الدعوة لا من وقت الإرسال.
 *
 * الصف الفاشل لا يُسقط الدفعة: يُسجَّل خطؤه ويستمر الباقي. مسؤول
 * الموارد البشرية يحتاج تقريراً بما نجح وما لم ينجح، لا رسالة فشل
 * واحدة عن ملف من خمسمئة سطر.
 */
export async function handleEmployeeImport(job: Job<EmployeeImportJobData>): Promise<void> {
  const { importId, organizationId, actorUserId, rows } = job.data;

  await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.employeeImport.update({
      where: { id: importId },
      data: { status: 'processing', startedAt: new Date() },
    }),
  );

  const settings = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.employeeImport.findFirst({ where: { id: importId } }),
  );

  if (!settings) {
    logger.warn({ importId }, 'دفعة الاستيراد غير موجودة — تُتخطى');
    return;
  }

  const context = await loadContext(organizationId);

  // أخطاء التحليل كتبها الـAPI قبل الإدراج في الطابور، ونضيف إليها
  // أخطاء التنفيذ — فالتقرير الواحد يجمع مرحلتي الدفعة.
  const errors: ImportRowError[] = Array.isArray(settings.rowErrors)
    ? (settings.rowErrors as unknown as ImportRowError[])
    : [];

  let invited = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const outcome = await importRow(organizationId, actorUserId, row, context, {
        createCards: settings.createCards,
        sendInvites: settings.sendInvites,
        importId,
      });

      if (outcome === 'invited') {
        invited += 1;
      } else if (outcome === 'updated') {
        updated += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطأ غير معروف';
      logger.error({ importId, row: row.rowNumber, error: message }, 'فشل صف استيراد');
      // لا قيمة الحقل في السجل: الملف بيانات شخصية.
      errors.push({ row: row.rowNumber, reason: 'row_failed' });
    }
  }

  await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.employeeImport.update({
      where: { id: importId },
      data: {
        status: 'completed',
        invitedCount: invited,
        updatedCount: updated,
        skippedCount: skipped,
        errorCount: errors.length,
        rowErrors: errors as never,
        finishedAt: new Date(),
      },
    }),
  );

  logger.info(
    { importId, invited, updated, skipped, errors: errors.length },
    'اكتملت دفعة الاستيراد',
  );
}

/** يُوسم الفشل النهائي على الصف حتى لا تبقى الدفعة «قيد التنفيذ» أبداً. */
export async function handleEmployeeImportFailure(
  job: Job<EmployeeImportJobData>,
  error: Error,
): Promise<void> {
  const { importId, organizationId } = job.data;

  await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.employeeImport.update({
      where: { id: importId },
      data: {
        status: 'failed',
        failureReason: error.message.slice(0, 300),
        finishedAt: new Date(),
      },
    }),
  ).catch((failure: Error) =>
    logger.error({ importId, error: failure.message }, 'تعذّر تسجيل فشل الدفعة'),
  );
}

interface ImportContext {
  organizationName: string;
  departmentsByCode: Map<string, string>;
  branchesByCode: Map<string, string>;
  rolesByKey: Map<string, string>;
  defaultTemplateKey: string;
}

async function loadContext(organizationId: string): Promise<ImportContext> {
  const [organization, roles, template] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    prisma.role.findMany({ where: { organizationId: null }, select: { id: true, key: true } }),
    prisma.template.findFirst({ where: { isActive: true }, orderBy: { key: 'asc' } }),
  ]);

  const { departments, branches } = await withRlsContext(
    prisma,
    { organizationId },
    async (tx) => ({
      departments: await tx.department.findMany({ select: { id: true, code: true } }),
      branches: await tx.branch.findMany({ select: { id: true, code: true } }),
    }),
  );

  return {
    organizationName: organization?.name ?? '',
    departmentsByCode: new Map(
      departments.filter((entry) => entry.code).map((entry) => [entry.code as string, entry.id]),
    ),
    branchesByCode: new Map(
      branches.filter((entry) => entry.code).map((entry) => [entry.code as string, entry.id]),
    ),
    rolesByKey: new Map(roles.map((role) => [role.key, role.id])),
    defaultTemplateKey: template?.key ?? 'classic',
  };
}

type RowOutcome = 'invited' | 'updated' | 'skipped';

async function importRow(
  organizationId: string,
  actorUserId: string,
  row: EmployeeImportRow,
  context: ImportContext,
  options: { createCards: boolean; sendInvites: boolean; importId: string },
): Promise<RowOutcome> {
  const roleId = context.rolesByKey.get(row.roleKey ?? 'member') ?? context.rolesByKey.get('member');

  if (!roleId) {
    throw new Error('الدور النظامي "member" غير موجود');
  }

  // رمز وحدة غير معروف لا يُسقط الصف: الموظف يُضاف بلا إدارة، ويُصحَّح
  // موقعه لاحقاً. رفضه كان سيوقف استيراد مؤسسة كاملة لأجل قسم واحد
  // نُسي إنشاؤه.
  const departmentId = row.departmentCode
    ? (context.departmentsByCode.get(row.departmentCode) ?? null)
    : null;
  const branchId = row.branchCode ? (context.branchesByCode.get(row.branchCode) ?? null) : null;

  const existingUser = await prisma.user.findUnique({
    where: { email: row.email },
    select: { id: true, locale: true, deletedAt: true },
  });

  // ---- الموظف مسجَّل وعضو: تحديث بياناته لا دعوته ----
  if (existingUser && !existingUser.deletedAt) {
    const membership = await withRlsContext(prisma, { organizationId }, (tx) =>
      tx.organizationMembership.findFirst({
        where: { userId: existingUser.id },
        select: { id: true, revokedAt: true },
      }),
    );

    if (membership && membership.revokedAt === null) {
      await withRlsContext(prisma, { organizationId }, (tx) =>
        tx.organizationMembership.update({
          where: { id: membership.id },
          data: {
            departmentId,
            branchId,
            jobTitle: row.jobTitle,
            employeeNo: row.employeeNo,
          },
        }),
      );

      if (options.createCards) {
        await ensureDraftCard(organizationId, existingUser.id, row, context);
      }

      return 'updated';
    }
  }

  // ---- دعوة ----
  const existingInvite = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.invitation.findFirst({
      where: { emailNormalized: row.email, status: 'pending', expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  );

  if (existingInvite) {
    // دعوة معلّقة قائمة: نحدّث بياناتها ولا نولّد رمزاً جديداً — إعادة
    // المحاولة لا يجوز أن تُبطل رابطاً وصل إلى الموظف بالفعل.
    await withRlsContext(prisma, { organizationId }, (tx) =>
      tx.invitation.update({
        where: { id: existingInvite.id },
        data: {
          roleId,
          departmentId,
          branchId,
          jobTitle: row.jobTitle,
          employeeNo: row.employeeNo,
          importId: options.importId,
        },
      }),
    );

    return 'skipped';
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const invitation = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.invitation.create({
      data: {
        organizationId,
        email: row.email,
        emailNormalized: row.email,
        tokenHash,
        roleId,
        departmentId,
        branchId,
        jobTitle: row.jobTitle,
        employeeNo: row.employeeNo,
        invitedByUserId: actorUserId,
        importId: options.importId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3_600_000),
      },
    }),
  );

  if (options.sendInvites) {
    await enqueueEmail({
      to: row.email,
      template: EMAIL_TEMPLATES.ORGANIZATION_INVITE,
      locale: existingUser?.locale === 'en' ? 'en' : 'ar',
      variables: {
        organizationName: context.organizationName,
        inviteUrl: `${appBaseUrl()}/invitations/${token}`,
      },
      organizationId,
      // المفتاح من معرّف الدعوة: إعادة تشغيل الدفعة على دعوة موجودة
      // لا تصل إلى هنا أصلاً، وإعادة تشغيلها على دعوة أُنشئت للتو
      // تنتج المفتاح نفسه فلا تُرسل مرتين.
      idempotencyKey: idempotencyKeyFrom('invite', invitation.id),
    });
  }

  return 'invited';
}

/**
 * ينشئ بطاقة مسودة للموظف.
 *
 * الرابط مشتق من البريد لا من الاسم: الاسم قد يتكرر في مؤسسة كبيرة،
 * والرابط مورد عالمي لا يُعاد استخدامه (القاعدة 13). التعارض يُحلّ
 * بلاحقة عشوائية، والفشل بعدها يُسقط البطاقة وحدها لا الصف.
 */
async function ensureDraftCard(
  organizationId: string,
  userId: string,
  row: EmployeeImportRow,
  context: ImportContext,
): Promise<void> {
  const existing = await withRlsContext(prisma, { organizationId }, (tx) =>
    tx.card.findFirst({ where: { ownerUserId: userId, deletedAt: null }, select: { id: true } }),
  );

  if (existing) {
    return;
  }

  const base = slugFromEmail(row.email);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;

    try {
      await withRlsContext(prisma, { organizationId }, (tx) =>
        tx.card.create({
          data: {
            organizationId,
            ownerUserId: userId,
            slug,
            status: 'draft',
            templateKey: context.defaultTemplateKey,
            templateVersion: 1,
            defaultLocale: 'ar',
            localizations: {
              create: {
                locale: 'ar',
                fullName: row.fullName ?? row.email.split('@')[0] ?? '',
                jobTitle: row.jobTitle,
                organizationName: context.organizationName,
              },
            },
          },
        }),
      );
      return;
    } catch {
      // تعارض الرابط — نحاول بلاحقة أخرى.
    }
  }

  logger.warn({ userId }, 'تعذّر تخصيص رابط لبطاقة الموظف المستورد');
}

function slugFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'card';
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned.length >= 3 ? cleaned.slice(0, 40) : `card-${randomBytes(3).toString('hex')}`;
}

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
