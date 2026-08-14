import { Injectable, Logger } from '@nestjs/common';
import { withRlsContext } from '@nomiqa/database';
import { CONSENT_PURPOSES, type ConsentPurpose } from '@nomiqa/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * إصدارات المستندات الحالية.
 *
 * تغيير النص يستوجب رفع الإصدار، فتصبح الموافقة السابقة غير سارية
 * على النص الجديد ويُطلب من المستخدم الموافقة من جديد.
 */
export const DOCUMENT_VERSIONS: Record<ConsentPurpose, string> = {
  terms: '2026-08-14',
  privacy: '2026-08-14',
  marketing: '2026-08-14',
};

export interface ConsentState {
  purpose: ConsentPurpose;
  granted: boolean;
  documentVersion: string | null;
  /** هل الموافقة على الإصدار الحالي؟ إن لا، تُطلب من جديد. */
  currentVersion: boolean;
  updatedAt: Date | null;
}

export interface RecordConsentInput {
  userId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  ipAddress?: string;
  userAgent?: string;
  source?: string;
}

@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * يسجّل موافقة أو سحبها.
   *
   * لا تحديث لصف قائم: كل قرار صف جديد. سجل الموافقات دليل قانوني،
   * وتعديله بأثر رجعي يفقده قيمته الإثباتية.
   */
  async record(input: RecordConsentInput): Promise<void> {
    await withRlsContext(this.prisma, { userId: input.userId }, (tx) =>
      tx.userConsent.create({
        data: {
          userId: input.userId,
          purpose: input.purpose,
          granted: input.granted,
          documentVersion: DOCUMENT_VERSIONS[input.purpose],
          source: input.source ?? 'web',
          ipAddress: input.ipAddress,
          userAgent: input.userAgent?.slice(0, 255),
        },
      }),
    );

    this.logger.log(`سُجّلت موافقة ${input.purpose} = ${input.granted}`);
  }

  /** الحالة الحالية لكل غرض: آخر قرار مسجّل. */
  async currentState(userId: string): Promise<ConsentState[]> {
    const rows = await withRlsContext(this.prisma, { userId }, (tx) =>
      tx.userConsent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    );

    return CONSENT_PURPOSES.map((purpose) => {
      const latest = rows.find((row) => row.purpose === purpose);

      return {
        purpose,
        granted: latest?.granted ?? false,
        documentVersion: latest?.documentVersion ?? null,
        currentVersion: latest?.documentVersion === DOCUMENT_VERSIONS[purpose],
        updatedAt: latest?.createdAt ?? null,
      };
    });
  }

  /** سجل كامل للتصدير — يثبت متى وافق ومتى سحب. */
  async history(userId: string) {
    return withRlsContext(this.prisma, { userId }, (tx) =>
      tx.userConsent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    );
  }
}
