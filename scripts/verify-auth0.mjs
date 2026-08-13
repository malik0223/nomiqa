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

section('5. التحقق من تسجيل الـAPI');

console.log(`      الـaudience المعرّف: ${env.AUTH0_AUDIENCE}`);
warn(
  'لا يمكن التحقق من تسجيل الـAPI دون بيانات Management API',
  'تحقق يدوياً: Applications → APIs يجب أن يحتوي Identifier مطابقاً حرفياً للقيمة أعلاه',
);

// ---------- الخلاصة ----------

console.log('\n' + '─'.repeat(56));

if (failures > 0) {
  console.log(`${CROSS} فشل التحقق: ${failures} مشكلة${warnings > 0 ? ` و${warnings} تنبيه` : ''}.`);
  console.log('  راجع docs/auth0-setup.md\n');
  process.exit(1);
}

console.log(`${CHECK} إعداد Auth0 سليم${warnings > 0 ? ` (${warnings} تنبيه يحتاج فحصاً يدوياً)` : ''}.`);
console.log('  الخطوة التالية: pnpm dev ثم جرّب تسجيل الدخول على http://localhost:3000\n');
