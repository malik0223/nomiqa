import { expect, test } from '@playwright/test';
import QRCode from 'qrcode';

/**
 * بوابة خروج المرحلة 2 على الصفحة العامة.
 *
 * كل اختبار هنا يقابل بنداً في قائمة التحقق، لا سلوكاً عاماً:
 *  - تُفتح دون تسجيل ودون تطبيق.
 *  - الرابط ثابت، وQR يشير إليه لا إلى محتوى البطاقة.
 *  - vCard يعمل فعلاً على iOS وAndroid (نتحقق من النوع والترميز؛
 *    الفتح على جهاز حقيقي يبقى فحصاً يدوياً قبل Alpha).
 *  - العرض صحيح باتجاه RTL.
 */

const SLUG = process.env.E2E_CARD_SLUG ?? 'demo-card';

test.describe('البطاقة العامة', () => {
  test('تُفتح من الجذر بلا تسجيل دخول', async ({ page }) => {
    // سياق متصفح نظيف: لا كوكيز ولا جلسة — وهذا بالضبط حال الزائر.
    const response = await page.goto(`/${SLUG}`);

    expect(response?.status()).toBe(200);
    // لو أعاد التوجيه إلى تسجيل الدخول لسقط الشرط الأهم في المرحلة.
    expect(page.url()).not.toContain('/auth/login');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('تعرض بالعربية باتجاه من اليمين إلى اليسار', async ({ page }) => {
    await page.goto(`/${SLUG}`);

    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('article')).toHaveAttribute('dir', 'rtl');
  });

  test('تبدّل اللغة إلى الإنجليزية باتجاه معاكس', async ({ page }) => {
    await page.goto(`/${SLUG}?lang=en`);

    await expect(page.locator('article')).toHaveAttribute('dir', 'ltr');
  });

  test('أزرار التواصل روابط أصلية يفتحها الهاتف مباشرة', async ({ page }) => {
    await page.goto(`/${SLUG}`);

    await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
    await expect(page.locator('a[href^="https://wa.me/"]').first()).toBeVisible();
  });

  test('vCard يُقدَّم بنوع صحيح وترميز UTF-8', async ({ request }) => {
    const response = await request.get(`/c/${SLUG}/vcard`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/vcard');
    // بدون charset تصل الأسماء العربية مشوّهة إلى جهات الاتصال.
    expect(response.headers()['content-type']).toContain('utf-8');
    expect(response.headers()['content-disposition']).toContain('.vcf');

    const body = await response.text();
    expect(body).toContain('BEGIN:VCARD');
    expect(body).toContain('END:VCARD');
  });

  test('QR يشفّر الرابط الثابت لا محتوى البطاقة', async ({ request, baseURL }) => {
    const response = await request.get(`/c/${SLUG}/qr`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/svg+xml');

    // نولّد الرمز المتوقع من الرابط الثابت ونقارنه بالناتج: تطابقهما
    // يثبت أن المشفَّر هو الرابط لا بيانات البطاقة — وهو ما يجعل تعديل
    // البطاقة لا يستوجب إعادة طباعة أي رمز.
    //
    // `?src=qr` معامل قياس يميّز المسح عن فتح رابط مُشارَك. **المسار
    // نفسه لم يتغير**، وهو ما تنص عليه القاعدة §7.4.
    const expected = await QRCode.toString(`${baseURL}/${SLUG}?src=qr`, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 512,
      type: 'svg',
    });

    expect(await response.text()).toBe(expected);
  });

  test('رمز QR ثابت رغم تغيّر لغة العرض', async ({ request }) => {
    const [arabic, english] = await Promise.all([
      request.get(`/c/${SLUG}/qr`),
      request.get(`/c/${SLUG}/qr?lang=en`),
    ]);

    expect(await arabic.text()).toBe(await english.text());
  });

  test('معاينة الرابط في الشبكات الاجتماعية مكتملة', async ({ page }) => {
    await page.goto(`/${SLUG}`);

    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:url"]')).toHaveCount(1);
  });

  test('رابط غير موجود يعيد 404 لا خطأ خادم', async ({ page }) => {
    const response = await page.goto('/no-such-card-xyz');

    expect(response?.status()).toBe(404);
  });
});
