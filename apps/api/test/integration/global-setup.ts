import { PrismaClient } from '@nomiqa/database';

/**
 * دور قاعدة بيانات مقيّد يحاكي دور التطبيق في الإنتاج.
 *
 * حرج: بدون NOSUPERUSER و NOBYPASSRLS تتجاوز الاختبارات سياسات RLS
 * وتمرّ جميعها بلا معنى. الاختبارات نفسها تتحقق من هاتين الخاصيتين.
 */
export const TEST_ROLE = 'nomiqa_test_app';
export const TEST_ROLE_PASSWORD = 'test_app_pw';

/** يبني رابط اتصال بالدور المقيّد انطلاقاً من DATABASE_URL. */
export function restrictedDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL مطلوب لاختبارات التكامل');
  }

  const url = new URL(raw);
  url.username = TEST_ROLE;
  url.password = TEST_ROLE_PASSWORD;
  return url.toString();
}

export async function setup(): Promise<void> {
  const admin = new PrismaClient();

  try {
    // idempotent: الاختبارات تُشغَّل مراراً على قاعدة تطوير قائمة.
    await admin.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TEST_ROLE}') THEN
          CREATE ROLE ${TEST_ROLE} LOGIN PASSWORD '${TEST_ROLE_PASSWORD}'
            NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $$;
    `);

    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${TEST_ROLE}`);
    await admin.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${TEST_ROLE}`,
    );
  } finally {
    await admin.$disconnect();
  }
}

export async function teardown(): Promise<void> {
  // الدور يبقى — حذفه يتطلب سحب الامتيازات أولاً ولا فائدة منه،
  // فقاعدة CI مؤقتة أصلاً وقاعدة التطوير محلية.
}
