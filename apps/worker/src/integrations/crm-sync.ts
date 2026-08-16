import type { CrmSyncableField } from '@nomiqa/contracts';
import { getPrismaClient } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';
import { CrmError, upsertHubspotContact } from './hubspot.js';

const prisma = getPrismaClient();
const logger = createLogger('crm-sync');

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;
const LEASE_MINUTES = 5;

interface ClaimedSync {
  id: string;
  organization_id: string;
  connection_id: string;
  contact_id: string;
  attempts: number;
  provider: string;
  access_token: string;
  field_map: Record<string, string>;
  owner_strategy: string;
  owner_ref: string | null;
  marketing_consent_only: boolean;
}

/**
 * مزامنة جهات الاتصال إلى الـCRM (§11.5).
 *
 * أربع قواعد تحكم كل تنفيذ هنا، وكلها من بوابة خروج المرحلة:
 *
 *  1. **باتجاه واحد** — منّا إليهم. لا قراءة تعود فتكتب في صفوفنا.
 *  2. **بلا تكرار** — صف `crm_sync_logs` فريد على (وصلة، جهة اتصال)،
 *     ووجود `remote_id` فيه يحوّل كل مزامنة لاحقة تحديثاً. وقبل
 *     الإنشاء يبحث المزوّد بالبريد، فلا نُنشئ ما هو موجود عندهم أصلاً.
 *  3. **إعادة المحاولة بلا فقدان** — الفشل يبقى صفاً بحالته وسببه،
 *     ويُعاد إلى الطابور بتأجيل أُسّي حتى خمس محاولات. بعدها ينتظر
 *     قراراً بشرياً في الشاشة بدل أن يختفي.
 *  4. **الموافقة تُفحص عند الإرسال لا عند الجدولة** — سحبٌ للموافقة
 *     بعد الجدولة يجب أن يمنع الإرسال، والفحص وقت الجدولة كان يجعل
 *     صفاً جُدول أمس يغادر اليوم رغم سحب صاحبه إذنه.
 */
export async function syncCrmContacts(): Promise<number> {
  const claimed = await prisma.$queryRaw<ClaimedSync[]>`
    WITH pending AS (
      SELECT l.id
      FROM crm_sync_logs l
      JOIN crm_connections c ON c.id = l.connection_id
      WHERE l.status = 'pending'
        AND (l.next_attempt_at IS NULL OR l.next_attempt_at <= now())
        AND c.status = 'active'
      ORDER BY l.created_at
      LIMIT ${BATCH_SIZE}
      FOR UPDATE OF l SKIP LOCKED
    ),
    leased AS (
      UPDATE crm_sync_logs l
      SET attempts = l.attempts + 1,
          next_attempt_at = now() + make_interval(mins => ${LEASE_MINUTES}::int),
          updated_at = now()
      FROM pending p
      WHERE l.id = p.id
      RETURNING l.id, l.organization_id, l.connection_id, l.contact_id, l.attempts
    )
    SELECT l.*, c.provider, c.access_token, c.field_map, c.owner_strategy,
           c.owner_ref, c.marketing_consent_only
    FROM leased l
    JOIN crm_connections c ON c.id = l.connection_id
  `;

  for (const row of claimed) {
    await syncOne(row);
  }

  return claimed.length;
}

async function syncOne(row: ClaimedSync): Promise<void> {
  const contact = await prisma.contact.findFirst({
    where: { id: row.contact_id, organizationId: row.organization_id, deletedAt: null },
    select: {
      fullName: true,
      email: true,
      phone: true,
      organizationName: true,
      jobTitle: true,
      ownerUserId: true,
      consents: {
        where: { purpose: 'marketing' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { granted: true },
      },
    },
  });

  if (!contact) {
    // حُذف الصف بعد الجدولة: ليس فشلاً. نتخطاه صراحةً بدل أن نتركه
    // يعيد المحاولة خمس مرات على صف لن يعود.
    await skip(row.id, 'skip_deleted');
    return;
  }

  if (row.marketing_consent_only && contact.consents[0]?.granted !== true) {
    // القاعدة التي تجعل الوصلة قابلة للتشغيل في مؤسسة تلتزم: من لم
    // يمنح الموافقة التسويقية لا يغادر إلى نظام تسويق، ويبقى الصف
    // موسوماً بسبب استثنائه لا مفقوداً بلا أثر.
    await skip(row.id, 'skip_consent');
    return;
  }

  const properties = mapProperties(row.field_map, contact);

  if (Object.keys(properties).length === 0) {
    await skip(row.id, 'skip_empty');
    return;
  }

  try {
    const ownerRef = await resolveOwner(row, contact.ownerUserId);
    const result = await upsertHubspotContact(row.access_token, { properties, ownerRef });

    await prisma.$transaction([
      prisma.crmSyncLog.update({
        where: { id: row.id },
        data: {
          status: 'success',
          operation: result.operation,
          remoteId: result.remoteId,
          syncedAt: new Date(),
          nextAttemptAt: null,
          error: null,
        },
      }),
      prisma.crmConnection.update({
        where: { id: row.connection_id },
        data: { lastSyncAt: new Date(), lastError: null },
      }),
    ]);
  } catch (error) {
    await handleFailure(row, error as Error);
  }
}

async function handleFailure(row: ClaimedSync, error: Error): Promise<void> {
  const crmError = error instanceof CrmError ? error : null;
  const retryable = crmError?.retryable ?? true;
  const exhausted = !retryable || row.attempts >= MAX_ATTEMPTS;
  const message = error.message.slice(0, 300);

  await prisma.crmSyncLog.update({
    where: { id: row.id },
    data: {
      status: exhausted ? 'failed' : 'pending',
      error: message,
      nextAttemptAt: exhausted ? null : new Date(Date.now() + 2 ** row.attempts * 60_000),
    },
  });

  // خطأ مصادقة يوقف الوصلة كلها لا صفاً واحداً: رمز منتهٍ يعني أن كل
  // صف تالٍ سيفشل مثله، ومواصلة المحاولة تملأ السجل بمئة سطر يخفي
  // السبب الوحيد. الحالة `error` تظهر في الشاشة بجانب زر تحديث الرمز.
  if (crmError && (crmError.status === 401 || crmError.status === 403)) {
    await prisma.crmConnection.update({
      where: { id: row.connection_id },
      data: { status: 'error', lastError: message },
    });

    logger.error({ connectionId: row.connection_id }, 'أُوقفت وصلة CRM لخطأ مصادقة');
    return;
  }

  if (exhausted) {
    await prisma.crmConnection.update({
      where: { id: row.connection_id },
      data: { lastError: message },
    });
  }
}

/**
 * يجدول مزامنة جهة اتصال جديدة.
 *
 * يُستدعى من مسار الـOutbox عند `contact.captured`: العميل المحتمل
 * يصل الـCRM في دقائق لا في نهاية اليوم — وهو الفارق بين متابعة
 * ساخنة ومكالمة بعد أسبوع.
 *
 * `skipDuplicates` يستند إلى الفريد على (وصلة، جهة اتصال): إعادة
 * معالجة الحدث لا تُنتج صفاً ثانياً ولا نداءً ثانياً.
 */
export async function queueCrmSync(organizationId: string, contactId: string): Promise<void> {
  const connections = await prisma.crmConnection.findMany({
    where: { organizationId, status: 'active' },
    select: { id: true },
  });

  if (connections.length === 0) return;

  await prisma.crmSyncLog.createMany({
    data: connections.map((connection) => ({
      organizationId,
      connectionId: connection.id,
      contactId,
      status: 'pending',
      nextAttemptAt: new Date(),
    })),
    skipDuplicates: true,
  });
}

async function skip(logId: string, operation: string): Promise<void> {
  await prisma.crmSyncLog.update({
    where: { id: logId },
    data: { status: 'skipped', operation, nextAttemptAt: null, syncedAt: new Date() },
  });
}

/**
 * يبني خصائص المزوّد من خريطة الحقول.
 *
 * الخريطة تحكم لا الشيفرة: أسماء الحقول تختلف بين تثبيت وآخر — حقل
 * مخصص اسمه `job_title_ar` عند عميل و`title` عند غيره. تثبيتها في
 * الشيفرة كان يجعل كل تثبيت جديد تعديلاً في المنتج.
 *
 * والحقول الفارغة تُسقط: إرسال قيمة فارغة إلى CRM **يمسح** ما فيه،
 * فجهة اتصال ناقصة عندنا كانت ستمحو بيانات كاملة عندهم.
 */
export function mapProperties(
  fieldMap: Record<string, string>,
  contact: Partial<Record<CrmSyncableField, string | null>>,
): Record<string, string> {
  const properties: Record<string, string> = {};

  for (const [field, remoteName] of Object.entries(fieldMap)) {
    const value = contact[field as CrmSyncableField];

    if (typeof value === 'string' && value.trim().length > 0) {
      properties[remoteName] = value;
    }
  }

  return properties;
}

/**
 * يحدد مالك العميل المحتمل عند المزوّد (§11.5).
 *
 * `capturer` تحتاج ربطاً بين مستخدمنا ومستخدمهم، ولا نملكه بعد: بريد
 * الملتقِط هو الجسر الوحيد المتاح، وHubSpot لا يقبل بريداً مكان معرّف
 * مالك. لذلك تسقط إلى `owner_ref` إن وُجد، وإلا تُترك للمزوّد يوزّعها
 * بقواعده — وهو أصدق من إسناد كل العملاء إلى شخص واحد بالخطأ.
 */
async function resolveOwner(row: ClaimedSync, ownerUserId: string | null): Promise<string | null> {
  if (row.owner_strategy === 'fixed') {
    return row.owner_ref;
  }

  if (row.owner_strategy === 'unassigned' || !ownerUserId) {
    return null;
  }

  return row.owner_ref;
}
