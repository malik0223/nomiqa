import { NotFoundException } from '@nestjs/common';
import type { TenantScopedClient } from '@nomiqa/database';

/**
 * يتحقق أن البطاقة تخص المؤسسة الحالية.
 *
 * سياق RLS يمنع رؤية بطاقة مؤسسة أخرى فيعود الاستعلام فارغاً — والرسالة
 * «غير موجودة» لا «ممنوعة»: التمييز يؤكد لمن يخمّن معرّفات أن المعرّف
 * الذي جرّبه موجود في مكان ما.
 *
 * تعيش هنا لا في كل خدمة: الوسم والحملة كلاهما يربط كوداً عاماً ببطاقة،
 * ونسختان من هذا الفحص تعنيان احتمال تصحيح إحداهما دون الأخرى.
 */
export async function requireOwnCard(tx: TenantScopedClient, cardId: string): Promise<void> {
  const card = await tx.card.findFirst({
    where: { id: cardId, deletedAt: null },
    select: { id: true },
  });

  if (!card) {
    throw new NotFoundException('البطاقة غير موجودة');
  }
}
