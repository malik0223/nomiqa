/**
 * يلتقط لقطات دليل الاستخدام من الشاشات الحقيقية.
 *
 * الشرط: خادم التطوير يعمل في وضع العرض —
 *   pnpm --filter @nomiqa/web dev:demo
 *
 * ثم:
 *   node scripts/capture-guide-shots.mjs
 *
 * تُكتب الصور في docs/guide/shots/. تُلتقط بعرض سطح مكتب افتراضاً،
 * وبعرض جوال لكل شاشة عليها علامة `mobile` — الشاشات التي تُفتح
 * فعلياً من الهاتف (البطاقة العامة، المسح) يجب أن يراها القارئ كما
 * سيستعملها.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.NOMIQA_BASE_URL ?? 'http://localhost:3000';

/**
 * صيغتان لغرضين: PNG بدقة مضاعفة للأرشيف داخل المستودع، وJPEG أخف
 * للنسخة المنشورة — الدليل المنشور يحمل ثلاثين صورة، ومجموعها بصيغة
 * PNG يتجاوز حدّ الصفحة الواحدة.
 */
const FORMAT = process.env.NOMIQA_SHOT_FORMAT === 'jpeg' ? 'jpeg' : 'png';
const SCALE = Number(process.env.NOMIQA_SHOT_SCALE ?? (FORMAT === 'jpeg' ? 1.25 : 2));

const OUT = path.join(
  fileURLToPath(new URL('..', import.meta.url)),
  'docs',
  'guide',
  FORMAT === 'jpeg' ? 'shots-web' : 'shots',
);

/** [اسم الملف، المسار، خيارات] */
const shots = [
  ['01-home', '/ar', { full: true }],
  ['02-dashboard', '/ar/dashboard', { full: true }],
  ['03-cards', '/ar/cards', {}],
  ['04-card-new', '/ar/cards/new', {}],
  ['05-card-editor', '/ar/cards/c1', { full: true }],
  ['06-card-editor-links', '/ar/cards/c1', { scrollTo: 1000 }],
  ['07-public-card', '/sara-almamari', { mobile: true, full: true }],
  ['08-contacts', '/ar/contacts', { full: true }],
  ['09-contact-detail', '/ar/contacts/k1', { full: true }],
  ['10-team', '/ar/team', { full: true }],
  ['11-branding', '/ar/branding', { full: true }],
  ['12-approvals', '/ar/approvals', {}],
  ['13-directory', '/ar/directory', {}],
  ['14-nfc', '/ar/nfc', { full: true }],
  ['15-signature', '/ar/signature', { full: true }],
  ['16-campaigns', '/ar/campaigns', { full: true }],
  ['17-campaign-report', '/ar/campaigns/cp1', {}],
  ['18-events', '/ar/events', { full: true }],
  ['19-event-report', '/ar/events/ev1', { full: true }],
  ['20-scan', '/ar/scan', { mobile: true, full: true }],
  ['21-integrations', '/ar/integrations', { full: true }],
  ['22-billing', '/ar/billing', { full: true }],
  ['23-invoice', '/ar/billing/invoices/inv1', {}],
  ['24-settings', '/ar/settings', { full: true }],
  ['25-support', '/ar/support', {}],
  ['26-dashboard-dark', '/ar/dashboard', { dark: true }],
  ['27-public-card-dark', '/sara-almamari', { mobile: true, dark: true, full: true }],
  ['28-home-en', '/en', { full: true }],
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const [name, route, options] of shots) {
  const context = await browser.newContext({
    viewport: options.mobile ? { width: 420, height: 900 } : { width: 1440, height: 960 },
    deviceScaleFactor: SCALE,
    locale: 'ar',
    // الوضع الداكن يُفرض بالتخزين المحلي لا بتفضيل النظام: التطبيق
    // يقرأ `nq-theme` قبل أول رسم، وهو ما يفعله المستخدم فعلاً.
    colorScheme: options.dark ? 'dark' : 'light',
  });

  if (options.dark) {
    await context.addInitScript(() => {
      localStorage.setItem('nq-theme', 'dark');
    });
  }

  const page = await context.newPage();

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 120_000 });
    // الخطوط تصل من الشبكة؛ لقطة قبل وصولها تُظهر الخط الاحتياطي.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);

    if (options.scrollTo) {
      await page.evaluate((y) => window.scrollTo(0, y), options.scrollTo);
      await page.waitForTimeout(400);
    }

    await page.screenshot({
      path: path.join(OUT, `${name}.${FORMAT}`),
      type: FORMAT,
      ...(FORMAT === 'jpeg' ? { quality: 78 } : {}),
      fullPage: Boolean(options.full),
    });

    console.log('✓', name);
  } catch (error) {
    console.error('✕', name, error instanceof Error ? error.message : error);
  }

  await context.close();
}

await browser.close();
console.log(`\nالصور في ${OUT}`);
