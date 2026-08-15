import { expect, test } from '@playwright/test';

/**
 * نموذج «شارك بياناتك معي» على الصفحة العامة.
 *
 * كل اختبار هنا يقابل ضابطاً في docs/contacts/capture.md لا سلوكاً
 * عاماً: النموذج يكتب بيانات شخصية بمدخل من مجهول، فكسر أي ضابط منها
 * صامتاً هو أسوأ ما قد يحدث في هذه المرحلة.
 */

const SLUG = process.env.E2E_CARD_SLUG ?? 'demo-card';

test.describe('نموذج التواصل العام', () => {
  test('يظهر للزائر بلا تسجيل دخول', async ({ page }) => {
    await page.goto(`/${SLUG}`);

    await expect(page.locator('#contact-fullName')).toBeVisible();
    await expect(page.locator('#contact-contactConsent')).toBeVisible();
  });

  test('لا يُرسل بلا موافقة', async ({ page }) => {
    await page.goto(`/${SLUG}`);

    await page.fill('#contact-fullName', 'زائر بلا موافقة');
    await page.fill('#contact-email', 'noconsent@example.com');
    await page.click('form button[type="submit"]');

    // مربع الموافقة `required`، فالمتصفح يمنع الإرسال أصلاً — والـAPI
    // يرفضه أيضاً لو تُخطّي المتصفح. يكفينا هنا بقاء النموذج قائماً.
    await expect(page.locator('#contact-fullName')).toBeVisible();
  });

  test('يحفظ البيانات ويعرض رسالة تأكيد', async ({ page }) => {
    await page.goto(`/${SLUG}`);

    const unique = `e2e-${Date.now()}@example.com`;
    await page.fill('#contact-fullName', 'زائر الاختبار الآلي');
    await page.fill('#contact-email', unique);
    await page.check('#contact-contactConsent');
    await page.click('form button[type="submit"]');

    await expect(page.getByRole('status')).toBeVisible();
    // النموذج يختفي بعد النجاح: بقاؤه يدعو إلى إرسال ثانٍ يصنع تكراراً.
    await expect(page.locator('#contact-fullName')).toHaveCount(0);
  });

  test('حقل المصيدة مخفي عن الزائر', async ({ page }) => {
    await page.goto(`/${SLUG}`);

    // مخفي عن البشر وعن قارئات الشاشة، ظاهر لروبوت يملأ كل حقل يجده.
    await expect(page.locator('#website')).toBeHidden();
  });

  test('يعرض نصوص النموذج بالإنجليزية عند تبديل اللغة', async ({ page }) => {
    await page.goto(`/${SLUG}?lang=en`);

    await expect(page.locator('label[for="contact-fullName"]')).toContainText('Full name');
  });
});
