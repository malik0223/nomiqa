/**
 * منح أو سحب صلاحية إدارة المنصة.
 *
 *   pnpm admin:grant  user@example.com
 *   pnpm admin:revoke user@example.com
 *   pnpm admin:list
 *
 * لماذا سكربت لا واجهة؟ هذه أخطر صلاحية في النظام — تتجاوز حدود
 * المؤسسات. جعلها على بُعد نقرة يعني أن اختراق حساب إداري واحد يمنح
 * المهاجم القدرة على ترقية نفسه. المنح خارج التطبيق يفرض وصولاً إلى
 * الخادم، وهو حاجز مستقل عن حسابات المنتج.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [action, email] = process.argv.slice(2);

  if (action === 'list') {
    const admins = await prisma.platformAdmin.findMany({
      where: { revokedAt: null },
      include: { user: { select: { email: true, fullName: true } } },
    });

    if (admins.length === 0) {
      console.warn('لا يوجد مسؤولو منصة.');
      return;
    }

    console.warn(`مسؤولو المنصة (${admins.length}):`);
    for (const admin of admins) {
      console.warn(`  · ${admin.user.email} — مُنحت ${admin.grantedAt.toISOString()}`);
    }
    return;
  }

  if (!email) {
    console.error('الاستخدام: grant|revoke|list <email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.error(`لا يوجد مستخدم بالبريد ${email}. يجب أن يسجّل دخوله مرة أولاً.`);
    process.exit(1);
  }

  if (action === 'grant') {
    await prisma.platformAdmin.upsert({
      where: { userId: user.id },
      update: { revokedAt: null },
      create: { userId: user.id },
    });
    console.warn(`✔ مُنحت صلاحية إدارة المنصة لـ${email}`);
    return;
  }

  if (action === 'revoke') {
    const result = await prisma.platformAdmin.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    console.warn(
      result.count > 0 ? `✔ سُحبت الصلاحية من ${email}` : `${email} ليس مسؤول منصة أصلاً.`,
    );
    return;
  }

  console.error('إجراء غير معروف. المتاح: grant | revoke | list');
  process.exit(1);
}

main()
  .catch((error) => {
    console.error('فشل:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
