#!/usr/bin/env node
/**
 * يتحقق من أن إعداد Auth0 في .env يطابق ما تتوقعه الشيفرة فعلاً.
 *
 * يُشغَّل بـ: pnpm verify:auth0
 *
 * لا يطبع هذا السكربت أي سر. القيم الحساسة تظهر كطول فقط.
 */

const CHECK = '✓';
const CROSS = '✗';
const WARN = '!';

let failures = 0;
let warnings = 0;

function pass(message) {
  console.log(`  ${CHECK} ${message}`);
}

function fail(message, hint) {
  failures += 1;
  console.log(`  ${CROSS} ${message}`);
  if (hint) console.log(`      ${hint}`);
}

function warn(message, hint) {
  warnings += 1;
  console.log(`  ${WARN} ${message}`);
  if (hint) console.log(`      ${hint}`);
}

function section(title) {
  console.log(`\n${title}`);
}

// ---------- 1. المتغيرات المطلوبة ----------

section('1. متغيرات البيئة');

const required = ['AUTH0_DOMAIN', 'AUTH0_AUDIENCE', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET'];
const env = {};

for (const key of required) {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    fail(`${key} غير معرّف`, 'راجع docs/auth0-setup.md القسم 5');
    continue;
  }
  env[key] = value.trim();
  pass(`${key} موجود (${value.trim().length} حرفاً)`);
}

// قيم .env.example النموذجية — وجودها يعني أن الملف لم يُعبَّأ فعلاً.
if (env.AUTH0_DOMAIN?.startsWith('your-tenant.')) {
  fail('AUTH0_DOMAIN ما زال القيمة النموذجية من .env.example');
}

if (env.AUTH0_SECRET && env.AUTH0_SECRET.length < 32) {
  fail(
    'AUTH0_SECRET قصير جداً',
    'ولّده بـ: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
}

if (env.AUTH0_DOMAIN?.startsWith('http')) {
  fail(
    'AUTH0_DOMAIN يجب أن يكون النطاق فقط بلا بروتوكول',
    'مثال صحيح: nomiqa-dev.eu.auth0.com',
  );
  delete env.AUTH0_DOMAIN;
}

if (failures > 0) {
  console.log(`\n${CROSS} توقف التحقق: أكمل متغيرات البيئة أولاً.\n`);
  process.exit(1);
}

// ---------- 2. الاتصال بالـTenant ----------

section('2. الاتصال بـTenant');

const discoveryUrl = `https://${env.AUTH0_DOMAIN}/.well-known/openid-configuration`;
let discovery;

try {
  const response = await fetch(discoveryUrl, { signal: AbortSignal.timeout(10_000) });

  if (!response.ok) {
    fail(`الـTenant لا يستجيب (HTTP ${response.status})`, `تحقق من AUTH0_DOMAIN: ${env.AUTH0_DOMAIN}`);
  } else {
    discovery = await response.json();
    pass(`الـTenant متاح: ${env.AUTH0_DOMAIN}`);
  }
} catch (error) {
  fail(`تعذّر الوصول إلى الـTenant: ${error.message}`, `تحقق من AUTH0_DOMAIN والاتصال بالشبكة`);
}

// ---------- 3. مطابقة الـissuer ----------

if (discovery) {
  section('3. مطابقة الـissuer');

  // الحارس في apps/api يبني الـissuer بهذه الصيغة بالضبط، مع الشرطة الأخيرة.
  const expectedIssuer = `https://${env.AUTH0_DOMAIN}/`;

  if (discovery.issuer === expectedIssuer) {
    pass(`الـissuer يطابق ما يبنيه الحارس: ${expectedIssuer}`);
  } else {
    fail(
      `عدم تطابق الـissuer`,
      `الحارس يتوقع "${expectedIssuer}" بينما الـTenant يعلن "${discovery.issuer}"`,
    );
  }

  section('4. مفاتيح التوقيع JWKS');

  try {
    const jwksResponse = await fetch(discovery.jwks_uri, { signal: AbortSignal.timeout(10_000) });
    const jwks = await jwksResponse.json();

    if (Array.isArray(jwks.keys) && jwks.keys.length > 0) {
      pass(`JWKS متاح — ${jwks.keys.length} مفتاحاً`);

      const rs256 = jwks.keys.filter((key) => key.alg === 'RS256' || key.kty === 'RSA');
      if (rs256.length > 0) {
        pass('يوجد مفتاح RS256 كما يتطلب الحارس');
      } else {
        fail('لا يوجد مفتاح RS256', 'اضبط Signing Algorithm على RS256 في إعداد الـAPI');
      }
    } else {
      fail('JWKS فارغ');
    }
  } catch (error) {
    fail(`تعذّر جلب JWKS: ${error.message}`);
  }
}

// ---------- 5. التحقق من الـaudience ----------

section('5. تدفق الدخول الفعلي');

/**
 * نفحص `/authorize` بنفس المعاملات التي يرسلها التطبيق.
 *
 * هذا هو الفحص الحاسم: أي خلل هنا يظهر للمستخدم كرسالة عامة
 * "An error occurred during the authorization flow" بعد إدخال بياناته،
 * لأن Auth0 يعيد التوجيه إلى الـcallback حاملاً الخطأ.
 *
 * لا نستخدم فحص الـtoken endpoint هنا: رفض client_credentials طبيعي
 * لتطبيق ويب، فلا يميّز الإعداد السليم من المعطوب.
 */
try {
  const authorizeUrl = new URL(`https://${env.AUTH0_DOMAIN}/authorize`);
  const params = {
    client_id: env.AUTH0_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/auth/callback`,
    scope: 'openid profile email offline_access',
    audience: env.AUTH0_AUDIENCE,
    state: 'verify-probe',
    nonce: 'verify-probe',
  };
  for (const [key, value] of Object.entries(params)) {
    authorizeUrl.searchParams.set(key, value);
  }

  const response = await fetch(authorizeUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });

  const location = response.headers.get('location');

  if (response.status === 403) {
    fail(
      'Auth0 رفض redirect_uri',
      `أضف "${params.redirect_uri}" إلى Allowed Callback URLs في إعدادات التطبيق`,
    );
  } else if (location) {
    const target = new URL(location, `https://${env.AUTH0_DOMAIN}`);
    const oauthError = target.searchParams.get('error');
    const description = target.searchParams.get('error_description') ?? '';

    if (!oauthError) {
      pass('Auth0 يقبل الطلب ويعرض شاشة الدخول');
    } else if (/not authorized to access resource server/i.test(description)) {
      fail(
        'التطبيق غير مخوَّل على الـAPI — الدخول سيفشل بعد إدخال البيانات',
        'من Applications → APIs → Nomiqa API → تبويب Machine To Machine Applications، فعّل تخويل تطبيق الويب',
      );
    } else if (/service not found/i.test(description)) {
      fail(
        `الـAPI غير مسجّل: ${env.AUTH0_AUDIENCE}`,
        'أنشئه من Applications → APIs بمعرّف مطابق حرفياً — راجع docs/auth0-setup.md القسم 2',
      );
    } else {
      fail(`Auth0 أعاد الخطأ: ${oauthError}`, description || undefined);
    }
  } else {
    warn(`رد غير متوقع من /authorize: HTTP ${response.status}`);
  }
} catch (error) {
  warn(`تعذّر فحص تدفق الدخول: ${error.message}`);
}

// ---------- الخلاصة ----------

console.log('\n' + '─'.repeat(56));

if (failures > 0) {
  console.log(`${CROSS} فشل التحقق: ${failures} مشكلة${warnings > 0 ? ` و${warnings} تنبيه` : ''}.`);
  console.log('  راجع docs/auth0-setup.md\n');
  process.exit(1);
}

console.log(`${CHECK} إعداد Auth0 سليم${warnings > 0 ? ` (${warnings} تنبيه يحتاج فحصاً يدوياً)` : ''}.`);
console.log('  الخطوة التالية: pnpm dev ثم جرّب تسجيل الدخول على http://localhost:3000\n');
