# Nomiqa — منصة البطاقات التعريفية الرقمية

منصة SaaS لإدارة الهوية المهنية والتواصل وجمع العملاء المحتملين.

## الوثائق

| الوثيقة                                                                      | المحتوى                                       |
| ---------------------------------------------------------------------------- | --------------------------------------------- |
| [خارطة الطريق](Digital_Business_Card_SaaS_Roadmap_AR.md)                     | المراحل والنطاق وبوابات الخروج ومؤشرات الأداء |
| [المعمارية التقنية](Digital_Business_Card_SaaS_Technical_Architecture_AR.md) | الحزمة التقنية ونموذج البيانات وضوابط الأمان  |
| [خطة العمل](Digital_Business_Card_SaaS_Work_Plan_AR.md)                      | السبرنتات والمهام ومعايير الإنجاز             |
| [سجل ADR](docs/adr/README.md)                                                | القرارات المعمارية المعتمدة والمفتوحة         |

## المتطلبات

- Node.js ‏22.11+ (الإنتاج يعمل على 24 LTS)
- pnpm ‏11+
- Docker Desktop

## التشغيل المحلي

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm infra:up
```

```bash
pnpm db:migrate && pnpm db:seed
```

```bash
pnpm dev
```

| الخدمة        | العنوان                        |
| ------------- | ------------------------------ |
| Web           | http://localhost:3000          |
| API           | http://localhost:3001/api      |
| توثيق API     | http://localhost:3001/api/docs |
| MinIO Console | http://localhost:9001          |
| Mailpit       | http://localhost:8025          |

> تسجيل الدخول لن يعمل قبل تعبئة قيم Auth0 في `.env` — راجع القسم التالي.

## إعداد Auth0

القرار موثّق في [ADR-010](docs/adr/ADR-010-auth0-identity-provider.md).

1. أنشئ **Tenant منفصلاً لكل بيئة** (dev / staging / prod).
   منطقة الـTenant تُختار عند الإنشاء **ولا تتغير لاحقاً دون ترحيل** —
   احسمها مع قرار منطقة الاستضافة.
2. أنشئ تطبيق **Regular Web Application** لـNext.js:
   - Allowed Callback URLs: `http://localhost:3000/auth/callback`
   - Allowed Logout URLs: `http://localhost:3000`
3. أنشئ **API** في Auth0 بمعرّف (Identifier) مثل `https://api.nomiqa.local`،
   وضعه في `AUTH0_AUDIENCE`. بدونه يصدر Auth0 ‏ID Token فقط ويرفض الـAPI كل طلب.
4. ولّد `AUTH0_SECRET`:

```bash
openssl rand -hex 32
```

5. فعّل التحقق من البريد وسياسة كلمة المرور والحماية من المحاولات المتكررة.

## الأوامر

| الأمر                          | الوظيفة                      |
| ------------------------------ | ---------------------------- |
| `pnpm dev`                     | تشغيل Web وAPI وWorker معاً  |
| `pnpm lint`                    | فحص الشيفرة                  |
| `pnpm typecheck`               | فحص الأنواع                  |
| `pnpm test`                    | الاختبارات                   |
| `pnpm build`                   | بناء كل التطبيقات            |
| `pnpm db:migrate`              | تطبيق المهاجرات              |
| `pnpm db:studio`               | متصفح قاعدة البيانات         |
| `pnpm infra:up` / `infra:down` | تشغيل وإيقاف الخدمات المحلية |

## الهيكل

```text
apps/
├── web/       Next.js — الموقع، البطاقات العامة، لوحات التحكم
├── api/       NestJS — منطق الأعمال والصلاحيات والبيانات
└── worker/    BullMQ — المهام الخلفية والتكاملات

packages/
├── ui/            نظام التصميم
├── contracts/     الأنواع المشتركة
├── validation/    مخططات Zod
├── database/      Prisma schema والمهاجرات
├── observability/ السجلات والتتبّع
└── config/        الإعدادات ومخططات البيئة
```

## قواعد ملزمة على كل تغيير

هذه ليست توصيات — كل واحدة منها بند في مراجعة الـPull Request:

1. **كل جدول يخص المؤسسة يحمل `organizationId`**، وكل استعلام عليه مقيّد به،
   وتُضاف له سياسة RLS في مهاجرة.
2. **الصلاحيات تُقرأ من قاعدة بياناتنا لا من الـToken.** Auth0 مصدر الهوية فقط.
3. **Deny by default:** أي مسار غير معلَّم بـ`@Public` أو `@RequirePermissions` مرفوض.
4. **كل مدخل يُعاد التحقق منه في الـAPI** حتى لو تحقق منه المتصفح.
5. **لا بيانات شخصية ولا أسرار في السجلات** — أضف أي حقل جديد إلى `REDACT_PATHS`.
6. **كل معالج مهمة خلفية Idempotent** — إعادة المحاولة مضمونة الحدوث.
7. **كل نص واجهة له ترجمة عربية وإنجليزية**، والتخطيط يستخدم الخصائص المنطقية
   في CSS (`ms-*`, `me-*`, `ps-*`, `pe-*`) لا `left/right`.
8. **لا تعديل يدوي على قاعدة الإنتاج** — كل تغيير عبر مهاجرة مراجَعة في Git.
