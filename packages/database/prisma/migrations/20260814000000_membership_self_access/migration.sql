-- ============================================================
-- وصول المستخدم إلى عضوياته الخاصة
--
-- المشكلة التي تعالجها هذه المهاجرة:
--
-- سياسة عزل المؤسسات تشترط سياق مؤسسة لقراءة أي صف عضوية. لكن
-- عمليتين أساسيتين تحتاجان قراءة العضويات **قبل** معرفة المؤسسة أو
-- عبر عدة مؤسسات:
--
--   1. TenantContextGuard يتحقق من عضوية المستخدم ليقرر السماح —
--      وهو ما يحدد المؤسسة أصلاً، فلا يمكن اشتراطها مسبقاً.
--   2. مسار /me يسرد كل مؤسسات المستخدم، وهو استعلام مقيّد
--      بالمستخدم لا بالمؤسسة.
--
-- بدون هذه السياسة يُرفض كل طلب مصادَق فور تشغيل التطبيق بدور
-- NOBYPASSRLS. لا يظهر العطل في التطوير لأن الاتصال هناك superuser.
--
-- الأمان: السياسة مقصورة على SELECT، فلا تمنح أي قدرة على الكتابة،
-- وتكشف للمستخدم صفوفه هو فقط. سياسات PostgreSQL المسموحة تُجمع
-- بـOR، فيصبح الصف مرئياً إذا كان ضمن سياق المؤسسة **أو** يخص
-- المستخدم الحالي.
-- ============================================================

CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    value text;
BEGIN
    value := current_setting('app.user_id', true);

    IF value IS NULL OR value = '' THEN
        RETURN NULL;
    END IF;

    RETURN value::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app_current_user_id() IS
    'يقرأ app.user_id المضبوط بـSET LOCAL داخل Transaction. يُرجع NULL عند غياب السياق فلا تكشف السياسة أي صف.';

CREATE POLICY memberships_self_read ON "organization_memberships"
    FOR SELECT
    USING ("user_id" = app_current_user_id());

-- ملاحظة: لا سياسة مقابلة للكتابة عمداً. إنشاء العضوية وتعديلها
-- يبقيان محكومين بسياق المؤسسة وحده.
