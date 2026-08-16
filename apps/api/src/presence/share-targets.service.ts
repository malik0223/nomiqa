import { Injectable, NotFoundException } from '@nestjs/common';
import type { ShareTargetKind, ShareTargetResolution } from '@nomiqa/contracts';
import { normalizeShareCode } from '@nomiqa/validation';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * حل الكود القصير إلى بطاقته.
 *
 * المسار الثاني في المنصة الذي يُقرأ بلا مصادقة وبلا سياق مؤسسة — بعد
 * البطاقة العامة نفسها. الزائر يصل حاملاً وسم NFC أو ماسحاً رمزاً
 * مطبوعاً، ولا يملك جلسة ولا يعرف أن للمؤسسات وجوداً.
 *
 * كل المنطق في دالة `public_share_target` في قاعدة البيانات لا هنا:
 *  - الحل يتجاوز حدود المؤسسات بطبيعته، فلا سياق RLS يصلح له.
 *  - العدّاد يُحدَّث في الاستدعاء نفسه، فلا رحلة ثانية.
 *  - شرط «منشورة وغير محجوبة» يعيش مع بقية شروط النشر في مكان واحد.
 */
@Injectable()
export class ShareTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(rawCode: string): Promise<ShareTargetResolution> {
    const code = normalizeShareCode(rawCode);

    const rows = await this.prisma.$queryRaw<ShareTargetRow[]>`
      SELECT kind, slug, utm_source, utm_medium, utm_campaign, utm_term, utm_content
      FROM public_share_target(${code})
    `;

    const row = rows[0];

    // كود مجهول وكود لبطاقة أُلغي نشرها يعطيان الرد نفسه: التمييز
    // بينهما يحوّل المسار إلى أداة تحقق من وجود أكواد بالتخمين.
    if (!row) {
      throw new NotFoundException('الكود غير معروف');
    }

    return {
      kind: row.kind as ShareTargetKind,
      slug: row.slug,
      source: row.kind === 'nfc' ? 'nfc' : 'campaign',
      // معاملات UTM فارغة لحملة خارج نافذتها: الدالة تُصفّرها عمداً،
      // فيصل الزائر إلى البطاقة بلا أن يُسنَد إلى حملة أُغلقت.
      utm: row.utm_campaign
        ? {
            source: row.utm_source ?? '',
            medium: row.utm_medium ?? '',
            campaign: row.utm_campaign,
            term: row.utm_term,
            content: row.utm_content,
          }
        : null,
    };
  }
}

interface ShareTargetRow {
  kind: string;
  slug: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
}
