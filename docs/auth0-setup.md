# إعداد تطبيق Auth0

القرار موثّق في [ADR-010](adr/ADR-010-auth0-identity-provider.md).
هذه القيم ليست أمثلة — الشيفرة تتوقعها حرفياً.

---

## 0. قبل أن تبدأ: قرار المنطقة

منطقة الـTenant تُختار **عند الإنشاء ولا تتغير لاحقاً دون ترحيل كامل**.

| البيئة               | هل تبدأ الآن؟                                                      |
| -------------------- | ------------------------------------------------------------------ |
| Development          | **نعم** — بيانات التطوير قابلة للحذف، فاختيار المنطقة هنا غير ملزم |
| Staging / Production | **لا** — انتظر حسم منطقة الاستضافة، وأنشئهما في المنطقة نفسها      |

اختر منطقة قريبة جغرافياً من مستخدميك لتقليل زمن الاستجابة، ومتوافقة مع
تقييمك لنقل البيانات خارج السلطنة.

---

## 1. إنشاء الـTenant

اسم مقترح: `nomiqa-dev`. استخدم **Tenant منفصلاً لكل بيئة** — لا تفصل
البيئات بتطبيقات داخل Tenant واحد، لأن الإعدادات والمستخدمين مشتركون.

---

## 2. تسجيل الـAPI (يجب أن يسبق التطبيق)

`Applications → APIs → Create API`

| الحقل             | القيمة                     |
| ----------------- | -------------------------- |
| Name              | `Nomiqa API`               |
| Identifier        | `https://api.nomiqa.local` |
| Signing Algorithm | `RS256`                    |

ثم في تبويب **Settings** الخاص بالـAPI:

- فعّل **Allow Offline Access** — بدونه لن يصدر Auth0 ‏Refresh Token
  رغم طلب `offline_access` في الـscope.

> **الـIdentifier ليس عنواناً يُزار.** إنه معرّف منطقي فقط، ولا يلزم أن
> يكون نطاقاً حقيقياً. هذه القيمة تذهب إلى `AUTH0_AUDIENCE`، ويتحقق منها
> [`auth0-jwt.guard.ts`](../apps/api/src/auth/auth0-jwt.guard.ts) في كل طلب.
>
> **إن لم تسجّل API، سيصدر Auth0 ‏ID Token فقط، وسيرفض الـAPI كل طلب.**

---

## 3. تسجيل تطبيق الويب

`Applications → Applications → Create Application`

| الحقل | القيمة                      |
| ----- | --------------------------- |
| Name  | `Nomiqa Web`                |
| Type  | **Regular Web Application** |

في **Settings**:

| الحقل                 | القيمة                                |
| --------------------- | ------------------------------------- |
| Allowed Callback URLs | `http://localhost:3000/auth/callback` |
| Allowed Logout URLs   | `http://localhost:3000`               |
| Allowed Web Origins   | `http://localhost:3000`               |

في **Advanced Settings → Grant Types** تأكد من تفعيل:

- `Authorization Code`
- `Refresh Token`

> مسار `/auth/callback` يحدده Auth0 SDK v4 تلقائياً. لا تغيّره إلا إذا
> غيّرت إعداد الـSDK في [`lib/auth0.ts`](../apps/web/src/lib/auth0.ts).

---

## 3.1 تخويل التطبيق على الـAPI ⚠️

**خطوة إلزامية ويسهل نسيانها.** تسجيل الـAPI وتسجيل التطبيق لا يكفيان —
يجب ربطهما صراحةً.

`Applications → APIs → Nomiqa API → تبويب Machine To Machine Applications`
→ فعّل التخويل لتطبيق **Nomiqa Web**.

بدون هذه الخطوة يرفض Auth0 الطلب عند `/authorize` ويعيد التوجيه إلى
الـcallback بالخطأ:

```text
invalid_request — Client "..." is not authorized to
access resource server "https://api.nomiqa.local"
```

ويظهر للمستخدم كرسالة عامة: _An error occurred during the authorization flow_.

العرض مضلّل لأن كل شيء آخر يبدو سليماً: الـTenant يستجيب، والـAPI مسجّل،
والدخول **ينجح** إذا حُذف `audience` من الطلب — لكن حذفه يعني رمزاً لا
يقبله الـAPI، فلا يصلح حلاً.

---

## 3.2 إضافة البريد إلى الـAccess Token (Action) ⚠️

**خطوة إلزامية تظهر فقط عند أول دخول حقيقي.** الـAPI يُنشئ سجل المستخدم من
`email` في حمولة الـAccess Token
([`user-provisioning.service.ts`](../apps/api/src/auth/user-provisioning.service.ts)).
لكن Auth0 **لا يضع `email` في الـAccess Token افتراضياً** — يضعه في الـID
Token فقط، حتى مع طلب scope الـ`email`. بدون الخطوة التالية ينجح الدخول ثم
يفشل أول طلب للـAPI بالرسالة: «الرمز لا يحتوي على بريد إلكتروني — تحقق من
Scopes».

`Actions → Triggers → post-login → Add Action → Build from scratch`

سمِّ الإجراء (مثلاً `Add email to access token`)، والصق:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  api.accessToken.setCustomClaim('email', event.user.email);
  api.accessToken.setCustomClaim('email_verified', event.user.email_verified);
  api.accessToken.setCustomClaim('name', event.user.name);
};
```

ثم **Deploy**، واسحب الإجراء إلى مسار **Login** واضغط **Apply**.

> الـAccess Token يقبل هذه المطالبات بلا namespace (بخلاف الـID Token)،
> لذا تقرؤها الشيفرة باسمها المجرّد `email` و`name`.
>
> بعد التفعيل **سجّل الخروج ثم الدخول من جديد** — الرمز الحالي صدر قبل
> الإجراء ولا يحمل البريد.

---

## 4. تطبيق Machine-to-Machine — مطلوب الآن

**حذف الحساب لا يعمل بدونه.** الحذف يجب أن ينفَّذ على الطرفين: قاعدة
بياناتنا + Auth0. حذفه من قاعدتنا وحدها يترك الهوية قائمة لدى المزوّد،
فيدخل المستخدم من جديد وتُنشأ له مؤسسة جديدة وكأن الحذف لم يحدث.

`Create Application → Machine to Machine` → اختر **Auth0 Management API**
→ امنح `read:users` و `delete:users` **فقط**.

ثم أضف إلى `.env`:

```ini
AUTH0_M2M_CLIENT_ID=<Client ID>
AUTH0_M2M_CLIENT_SECRET=<Client Secret>
```

> بدون هذه القيم يرفض الـAPI طلب الحذف بـ`503` ورسالة واضحة، ولا يبدأ
> حذفاً جزئياً. الرفض المبكر مقصود: بدء الحذف ثم اكتشاف العجز عن إتمامه
> يترك المستخدم في حالة أسوأ من عدم البدء.
>
> راجع [docs/privacy/deletion.md](privacy/deletion.md) لتفاصيل ما يُحذف
> وما يبقى ولماذا.

---

## 5. تعبئة `.env`

من صفحة **Settings** لتطبيق الويب:

```ini
AUTH0_DOMAIN=nomiqa-dev.eu.auth0.com
AUTH0_ISSUER_BASE_URL=https://nomiqa-dev.eu.auth0.com
AUTH0_AUDIENCE=https://api.nomiqa.local
AUTH0_CLIENT_ID=<Client ID>
AUTH0_CLIENT_SECRET=<Client Secret>
AUTH0_SECRET=<ولّده بالأمر أدناه>
```

توليد `AUTH0_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `.env` مستبعد من git. لا تضع أياً من هذه القيم في `.env.example`.

---

## 6. التحقق

```bash
pnpm verify:auth0
```

يفحص السكربت أن الـTenant موجود، وأن الـissuer يطابق ما يبنيه الحارس،
وأن JWKS متاح، وأن `AUTH0_SECRET` بالطول الكافي.

---

## 7. التهيئة الأمنية (بعد نجاح التحقق)

هذه مهام **تهيئة لا تطوير** — وهي أحد أسباب اختيار Auth0:

- `Security → Attack Protection`: فعّل Brute-force وSuspicious IP Throttling.
- `Authentication → Database`: فعّل **Requires Email Verification**.
- `Security → Multi-factor Auth`: فعّل MFA للحسابات الإدارية.
- `Branding → Universal Login`: أضف الشعار، واضبط اللغة الافتراضية إلى
  العربية، وتحقق من ظهور الشاشة بـRTL سليم.

---

## استكشاف الأخطاء

| العرض                                             | السبب الغالب                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `An error occurred during the authorization flow` | التطبيق غير مخوَّل على الـAPI — راجع القسم 3.1                             |
| الـAPI يرد `401` على كل طلب                       | لم تُسجَّل API في Auth0، أو `AUTH0_AUDIENCE` لا يطابق الـIdentifier حرفياً |
| `Callback URL mismatch`                           | العنوان في Auth0 لا يطابق `http://localhost:3000/auth/callback` تماماً     |
| لا يصدر Refresh Token                             | **Allow Offline Access** غير مفعّل على الـAPI                              |
| `Service not found` عند الدخول                    | `AUTH0_AUDIENCE` يشير إلى API غير موجود في هذا الـTenant                   |
| «الرمز لا يحتوي على بريد إلكتروني» عند أول دخول    | لا Action يضيف `email` إلى الـAccess Token — راجع القسم 3.2                 |
