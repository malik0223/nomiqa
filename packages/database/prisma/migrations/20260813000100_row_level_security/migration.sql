-- ============================================================
-- Row-Level Security — طبقة الدفاع الرابعة لعزل بيانات المؤسسات
-- المرجع: وثيقة المعمارية §6.3 و ADR-007
--
-- تحذير: هذه ليست الحماية الوحيدة ولا الأساسية.
-- التقييد الأساسي مسؤولية طبقة Repository في الـAPI.
-- RLS هنا شبكة أمان تلتقط أي استعلام أفلت من التقييد.
--
-- تُكتب هذه المهاجرة يدوياً لأن Prisma لا تولّد سياسات RLS.
-- ============================================================

-- ------------------------------------------------------------
-- دالة قراءة سياق المؤسسة من إعداد الجلسة.
-- تُرجع NULL بدل الفشل إذا لم يُضبط السياق، فتمنع السياسة كل الصفوف.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    value text;
BEGIN
    value := current_setting('app.organization_id', true);

    IF value IS NULL OR value = '' THEN
        RETURN NULL;
    END IF;

    RETURN value::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$;

COMMENT ON FUNCTION app_current_organization_id() IS
    'يقرأ app.organization_id المضبوط بـSET LOCAL داخل Transaction. يُرجع NULL عند غياب السياق فتمنع سياسات RLS كل الصفوف.';

-- ------------------------------------------------------------
-- organization_memberships
-- ------------------------------------------------------------
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_memberships" FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_isolation ON "organization_memberships"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

-- ------------------------------------------------------------
-- audit_logs
-- سجلات المنصة العامة (organization_id IS NULL) تبقى خارج نطاق
-- المؤسسات ولا تُقرأ إلا بدور إداري عبر اتصال مستثنى من RLS.
-- ------------------------------------------------------------
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_isolation ON "audit_logs"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

-- ------------------------------------------------------------
-- outbox_events
-- ------------------------------------------------------------
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_tenant_isolation ON "outbox_events"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

-- ============================================================
-- ملاحظات تشغيلية ملزمة
--
-- 1. FORCE ROW LEVEL SECURITY يجعل السياسات تنطبق حتى على مالك
--    الجدول. بدونه يتجاوزها مستخدم التطبيق إذا كان المالك.
--
-- 2. مستخدم قاعدة بيانات التطبيق يجب ألا يملك BYPASSRLS ولا
--    SUPERUSER. أنشئ دوراً مخصصاً للتطبيق عند إعداد الإنتاج:
--
--      CREATE ROLE nomiqa_app LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
--      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES
--        IN SCHEMA public TO nomiqa_app;
--
--    مهاجرات Prisma تُنفَّذ بمستخدم آخر أعلى صلاحية.
--
-- 3. عند استخدام Connection Pool يجب ضبط السياق بـSET LOCAL داخل
--    Transaction (withTenantContext في @nomiqa/database)، وإلا تسرّب
--    سياق مؤسسة إلى اتصال يُعاد استخدامه لمؤسسة أخرى.
--
-- 4. كل جدول جديد يحمل organization_id يجب أن تُضاف له سياسة هنا.
--    أضف هذا البند إلى قائمة مراجعة الـPull Request.
-- ============================================================
