-- ============================================================
-- توفّر الـslug عبر كل المؤسسات
--
-- المشكلة: `cards.slug` فريد **عالمياً** لأنه يظهر في الجذر
-- (nomiqa.om/<slug>)، لكن جدول cards محكوم بـRLS. فحص التوفر من داخل
-- سياق مؤسسة يرى صفوف تلك المؤسسة وحدها، فيُبلغ المستخدم أن الرابط
-- متاح ثم يفشل الإدراج بـunique violation — رسالة خطأ لا يفهمها أحد.
--
-- الحل المرفوض: تعطيل RLS على cards. مرفوض للسبب البدهي.
--
-- الحل المعتمد: دالة SECURITY DEFINER تُرجع **قيمة منطقية واحدة**.
-- أقصى ما تكشفه: أن رابطاً ما مأخوذ — وهي معلومة يكشفها الرابط العام
-- نفسه لأي زائر. لا صف ولا عمود من بيانات أي مؤسسة.
-- ============================================================

CREATE OR REPLACE FUNCTION card_slug_taken(candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
-- تثبيت search_path إلزامي مع SECURITY DEFINER.
SET search_path = public, pg_temp
AS $$
    -- البطاقة المحذوفة ناعماً تحتفظ برابطها: إعادة استخدامه تعني أن
    -- زائراً يفتح QR قديماً يصل إلى بطاقة شخص آخر.
    SELECT EXISTS (SELECT 1 FROM cards WHERE slug = lower(candidate));
$$;

COMMENT ON FUNCTION card_slug_taken(text) IS
    'هل الـslug مأخوذ عبر كل المؤسسات؟ يُرجع قيمة منطقية فقط — لا يكشف أي صف.';
