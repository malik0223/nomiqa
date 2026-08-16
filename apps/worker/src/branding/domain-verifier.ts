import { resolveTxt } from 'node:dns/promises';
import { getPrismaClient } from '@nomiqa/database';
import { createLogger } from '@nomiqa/observability';

const prisma = getPrismaClient();
const logger = createLogger('domain-verifier');

/**
 * التحقق من ملكية النطاقات المخصصة (خارطة الطريق §9.3).
 *
 * سجل TXT على `_nomiqa-challenge.<hostname>` يحمل رمزاً ولّدناه. من
 * يستطيع كتابة سجل DNS على نطاق يملكه فعلاً، وهذا ما نتحقق منه — لا
 * أن يكتب أحدهم اسم نطاق غيره في حقل نصّي.
 *
 * بلا هذا الفحص يستطيع أي عميل تسجيل نطاق منافس فيمنع صاحبه من
 * استخدامه (الفريد العالمي على `hostname`).
 */

/** أدنى فاصل بين فحصين للنطاق نفسه. انتشار DNS يحتاج وقتاً. */
const MIN_CHECK_INTERVAL = '15 minutes';

/** بعدها يُوسم النطاق `failed` ويحتاج إعادة إضافة. أسبوع تقريباً. */
const MAX_ATTEMPTS = 96;

const BATCH_SIZE = 20;

interface DomainRow {
  id: string;
  organization_id: string;
  hostname: string;
  verification_token: string;
  attempts: number;
}

export async function verifyPendingDomains(): Promise<void> {
  const domains = await prisma.$queryRaw<DomainRow[]>`
    SELECT * FROM custom_domains_due_for_check(
      ${BATCH_SIZE}::int,
      ${MIN_CHECK_INTERVAL}::interval
    )
  `;

  for (const domain of domains) {
    const result = await checkDomain(domain);

    await prisma.$executeRaw`
      SELECT custom_domain_record_check(
        ${domain.id}::uuid,
        ${result.verified}::boolean,
        ${result.reason}::text,
        ${MAX_ATTEMPTS}::int
      )
    `;

    if (result.verified) {
      logger.info({ hostname: domain.hostname }, 'تحقّق نطاق مخصص');
    }
  }
}

async function checkDomain(domain: DomainRow): Promise<{ verified: boolean; reason: string }> {
  const recordName = `_nomiqa-challenge.${domain.hostname}`;

  try {
    // `resolveTxt` تُرجع مصفوفة مصفوفات: السجل الواحد قد يُقسَّم إلى
    // مقاطع 255 بايت، فنصلها قبل المقارنة.
    const records = await resolveTxt(recordName);
    const values = records.map((chunks) => chunks.join('').trim());

    if (values.includes(domain.verification_token)) {
      return { verified: true, reason: '' };
    }

    return {
      verified: false,
      // لا نذكر القيم الموجودة: قد تحمل رموز تحقق لخدمات أخرى.
      reason: values.length === 0 ? 'لا يوجد سجل TXT' : 'قيمة سجل TXT لا تطابق الرمز',
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'DNS_ERROR';

    // ENOTFOUND وENODATA حالتان متوقعتان تماماً قبل أن يضيف العميل
    // السجل، فلا تُسجَّل أخطاءً بل تُعاد المحاولة.
    if (code !== 'ENOTFOUND' && code !== 'ENODATA') {
      logger.warn({ hostname: domain.hostname, code }, 'فشل استعلام DNS');
    }

    return { verified: false, reason: `تعذّر قراءة سجل TXT (${code})` };
  }
}
