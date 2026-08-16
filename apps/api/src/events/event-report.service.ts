import { Injectable, NotFoundException } from '@nestjs/common';
import type { EventLeadsPoint, EventMemberPerformance, EventReport } from '@nomiqa/contracts';
import { withRlsContext } from '@nomiqa/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { eventStatus, parseQualifiers } from './events.service.js';

/**
 * تقرير الفعالية — اللوحة المباشرة وتقرير ما بعدها (§11.3).
 *
 * **يُقرأ من صفوف جهات الاتصال لا من `analytics_rollups`.** الفارق ليس
 * تفضيلاً: الأحداث التحليلية تُحذف بعد 90 يوماً بحكم تقليل البيانات،
 * وتقرير معرض يُطلب بعد ستة أشهر — غالباً لتبرير المشاركة في نسخته
 * القادمة أمام من يوقّع على الميزانية. العميل المحتمل صفٌّ دائم، فهو
 * وحده ما يصلح أساساً لرقم يُقرأ بعد سنة.
 *
 * ولذلك أيضاً لا فرق بين «اللوحة المباشرة» و«التقرير النهائي» في
 * المصدر: الاثنان استعلام واحد على الصفوف نفسها، والفارق أن الأول
 * يُقرأ أثناء الفعالية والثاني بعدها. لوحة تُقرأ من مسار مختلف كانت
 * ستُظهر أرقاماً تخالف التقرير الذي يصل بعد يومين.
 */
@Injectable()
export class EventReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report(organizationId: string, eventId: string): Promise<EventReport> {
    const { event, contacts, members } = await withRlsContext(
      this.prisma,
      { organizationId },
      async (tx) => {
        const found = await tx.event.findFirst({ where: { id: eventId } });

        if (!found) {
          throw new NotFoundException('الفعالية غير موجودة');
        }

        const rows = await tx.contact.findMany({
          where: { eventId, deletedAt: null },
          select: {
            capturedAt: true,
            ownerUserId: true,
            source: true,
            qualifiers: true,
            duplicateOfId: true,
          },
        });

        // أسماء الأعضاء من العضويات لا من `users` مباشرةً: RLS تسمح
        // بقراءة عضويات المؤسسة الحالية، وقراءة جدول المستخدمين
        // بمعرّفات مجمّعة كانت تتجاوز حدود المؤسسة.
        const memberships = await tx.organizationMembership.findMany({
          select: { userId: true, user: { select: { fullName: true } } },
        });

        return { event: found, contacts: rows, members: memberships };
      },
    );

    const names = new Map(members.map((row) => [row.userId, row.user.fullName]));
    const qualifiers = parseQualifiers(event.qualifiers);
    const qualifierKeys = new Set(qualifiers.map((field) => field.key));

    let qualifiedLeads = 0;
    let duplicates = 0;
    let scannedLeads = 0;

    const byMember = new Map<string, EventMemberPerformance>();
    const byDay = new Map<string, EventLeadsPoint>();
    const breakdown: Record<string, Record<string, number>> = {};

    for (const key of qualifierKeys) {
      breakdown[key] = {};
    }

    for (const contact of contacts) {
      const values = readQualifierValues(contact.qualifiers, qualifierKeys);
      // «مؤهَّل» = مُلئ له حقل تأهيل واحد على الأقل. تعريف متعمَّد
      // التساهل: الحقول يعرّفها منظّم الفعالية ولا نعرف أيها يعني
      // «مهتم فعلاً»، فنقيس **أن المندوب توقف وسجّل شيئاً** — وهو
      // بالضبط ما يميّز لقاءً حقيقياً من بطاقة أُخذت من على طاولة.
      const qualified = Object.keys(values).length > 0;

      if (qualified) qualifiedLeads += 1;
      if (contact.duplicateOfId) duplicates += 1;
      if (contact.source === 'scan' || contact.source === 'badge') scannedLeads += 1;

      for (const [key, value] of Object.entries(values)) {
        const bucket = (breakdown[key] ??= {});
        bucket[value] = (bucket[value] ?? 0) + 1;
      }

      const ownerId = contact.ownerUserId ?? UNASSIGNED;
      const member = byMember.get(ownerId) ?? {
        userId: ownerId,
        fullName: ownerId === UNASSIGNED ? null : (names.get(ownerId) ?? null),
        leads: 0,
        qualifiedLeads: 0,
        duplicates: 0,
      };

      member.leads += 1;
      if (qualified) member.qualifiedLeads += 1;
      if (contact.duplicateOfId) member.duplicates += 1;
      byMember.set(ownerId, member);

      const day = startOfUtcDay(contact.capturedAt).toISOString();
      const point = byDay.get(day) ?? { date: day, leads: 0 };
      point.leads += 1;
      byDay.set(day, point);
    }

    const leads = contacts.length;

    return {
      eventId,
      name: event.name,
      status: eventStatus(event, new Date()),
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      leads,
      qualifiedLeads,
      duplicates,
      scannedLeads,
      qualificationRate: leads === 0 ? 0 : Math.round((qualifiedLeads / leads) * 1000) / 10,
      costBaisa: event.costBaisa,
      // القسمة على صفر تعطي «لا كلفة لكل عميل» لا «صفر»: فعالية بكلفة
      // معلنة ولم تجلب أحداً كلفتها لكل عميل غير معرَّفة، وعرض صفر
      // يقرؤها من يفتح الشاشة على أنها مجانية.
      costPerLeadBaisa:
        event.costBaisa === null || leads === 0 ? null : Math.round(event.costBaisa / leads),
      targetLeads: event.targetLeads,
      members: [...byMember.values()].sort((a, b) => b.leads - a.leads),
      series: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
      qualifierBreakdown: breakdown,
    };
  }
}

/** مفتاح تجميع من التُقطوا بلا مالك معروف — استيراد أو نموذج بلا مالك. */
const UNASSIGNED = 'unassigned';

/**
 * يقرأ قيم التأهيل المخزَّنة على جهة الاتصال.
 *
 * يقتصر على المفاتيح المعرَّفة في الفعالية **الآن**: حقل حُذف من
 * الإعداد بعد الفعالية لا يظهر في التقرير، وقيمه تبقى في الصف — فحذف
 * عمود من تقرير لا يجوز أن يمحو ما جمعه مندوب في القاعة.
 */
function readQualifierValues(raw: unknown, allowed: Set<string>): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }

  const values: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    values[key] = value;
  }

  return values;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
