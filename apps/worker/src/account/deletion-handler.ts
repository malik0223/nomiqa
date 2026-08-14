import type { AccountDeletionJobData } from '@nomiqa/contracts';
import { getPrismaClient } from '@nomiqa/database';
import type { Job } from 'bullmq';
import { deleteAuth0User } from './auth0-management.js';
import { deleteStorageObjects } from './storage-cleanup.js';

const prisma = getPrismaClient();

/**
 * التنفيذ الفعلي لحذف الحساب.
 *
 * ترتيب الخطوات مقصود ومبني على قابلية إعادة المحاولة:
 *
 *   1. الملفات أولاً — لأن حذفها يحتاج مفاتيحها من قاعدة البيانات،
 *      فحذف الصفوف قبلها يفقدنا القدرة على العثور عليها ويترك ملفات
 *      يتيمة في التخزين إلى الأبد.
 *   2. Auth0 ثانياً — قبل حذف صفنا، حتى لو فشل الحذف عندنا تكون
 *      الهوية قد انتهت فلا يستطيع الدخول.
 *   3. صفوف قاعدة البيانات أخيراً.
 *
 * كل خطوة Idempotent: إعادة المحاولة بعد نجاح جزئي لا تفشل.
 */
export async function handleAccountDeletion(job: Job<AccountDeletionJobData>): Promise<void> {
  const { requestId, userId, auth0UserId } = job.data;

  await markRequest(userId, requestId, 'processing');

  // ---- 1. الملفات ----
  const personalOrgIds = await findPersonalOrganizationIds(userId);
  let deletedFiles = 0;

  for (const organizationId of personalOrgIds) {
    deletedFiles += await deleteStorageObjects(prisma, organizationId);
  }

  // ---- 2. الهوية لدى المزوّد ----
  await deleteAuth0User(auth0UserId);

  // ---- 3. صفوف قاعدة البيانات ----
  // حذف المستخدم يجرّ معه العضويات والموافقات (onDelete: Cascade)،
  // ويصفّر actor في سجل التدقيق (onDelete: SetNull) فيبقى السجل
  // قائماً كأثر تشغيلي دون أن يحمل هوية.
  const deletedOrganizations = personalOrgIds.length;

  await prisma.$transaction(async (tx) => {
    // المؤسسات الشخصية تُحذف مع بياناتها؛ مؤسسات الأعمال تبقى
    // لأنها قد تضم أعضاء آخرين وبياناتهم ليست ملكاً للمنصرف.
    if (personalOrgIds.length > 0) {
      await tx.organization.deleteMany({ where: { id: { in: personalOrgIds } } });
    }

    await tx.user.delete({ where: { id: userId } });
  });

  await markRequest(userId, requestId, 'completed', {
    deletedFiles,
    deletedOrganizations,
  });
}

export async function handleAccountDeletionFailure(
  job: Job<AccountDeletionJobData> | undefined,
  error: Error,
): Promise<void> {
  if (!job) return;

  await markRequest(job.data.userId, job.data.requestId, 'failed', undefined, error.message);
}

/**
 * المؤسسات الشخصية التي هذا المستخدم عضوها الوحيد.
 *
 * لا نحذف مؤسسة تضم غيره حتى لو كان مالكها — بيانات بقية الأعضاء
 * ليست ملكه. نقل الملكية قبل الحذف مسألة منفصلة (المرحلة 4).
 */
async function findPersonalOrganizationIds(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ organization_id: string }>>`
    SELECT o.id AS organization_id
    FROM organizations o
    JOIN organization_memberships m ON m.organization_id = o.id
    WHERE m.user_id = ${userId}::uuid
      AND o.kind = 'personal'
      AND (SELECT count(*) FROM organization_memberships m2 WHERE m2.organization_id = o.id) = 1
  `;

  return rows.map((row) => row.organization_id);
}

/**
 * يحدّث حالة الطلب.
 *
 * يضبط app.user_id بمعرّف المستخدم — ويظل يعمل بعد حذف صفه، لأن
 * سياسة RLS تقارن العمود بقيمة الجلسة لا بصف قائم.
 */
async function markRequest(
  userId: string,
  requestId: string,
  status: string,
  outcome?: Record<string, number>,
  failureReason?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx.dataSubjectRequest.updateMany({
      where: { id: requestId },
      data: {
        status,
        ...(outcome ? { outcome } : {}),
        ...(failureReason ? { failureReason: failureReason.slice(0, 500) } : {}),
        ...(status === 'completed' ? { completedAt: new Date() } : {}),
      },
    });
  });
}
