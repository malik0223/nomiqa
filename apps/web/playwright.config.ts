import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

/**
 * اختبارات الصفحة العامة.
 *
 * ثلاثة أهداف مقصودة (§S4 من خطة العمل):
 *  - Chromium: أندرويد وسطح المكتب.
 *  - WebKit: **iOS**. أكثر ما ينكسر في البطاقات يظهر هنا أولاً —
 *    التنزيلات، `tel:`، والخطوط العربية.
 *  - Pixel 5: مقاس هاتف حقيقي، فأغلب من يفتح بطاقة يفتحها من هاتفه.
 *
 * تفترض بيئة تعمل مع بيانات `pnpm db:seed` (بطاقة `demo-card`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL,
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
