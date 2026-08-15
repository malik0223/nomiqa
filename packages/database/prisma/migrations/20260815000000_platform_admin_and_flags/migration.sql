-- CreateTable
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB,
    "request_id" TEXT,
    "ip_address" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percentage" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flag_overrides" (
    "flag_key" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("flag_key","organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_user_id_key" ON "platform_admins"("user_id");

-- CreateIndex
CREATE INDEX "platform_audit_logs_occurred_at_idx" ON "platform_audit_logs"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "platform_audit_logs_actor_user_id_occurred_at_idx" ON "platform_audit_logs"("actor_user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "feature_flag_overrides_organization_id_idx" ON "feature_flag_overrides"("organization_id");

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flag_key_fkey" FOREIGN KEY ("flag_key") REFERENCES "feature_flags"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- إحصاءات الإدارة دون تجاوز RLS
--
-- المشكلة: لوحة الإدارة تحتاج عدد أعضاء كل مؤسسة، لكن جدول
-- organization_memberships محكوم بـRLS فلا تُقرأ صفوفه بلا سياق.
--
-- الحل المرفوض: متغيّر جلسة مثل app.is_platform_admin تضيفه السياسات
-- بـOR. مرفوض لأن خطأً واحداً يضبط المتغيّر في المسار الخاطئ يسقط
-- العزل كله دفعة واحدة — وهو ما بنينا أربع طبقات لمنعه.
--
-- الحل المعتمد: دالة SECURITY DEFINER تُرجع **أعداداً فقط**. حتى لو
-- استُدعيت من مسار غير محمي، أقصى ما تكشفه أرقام مجمّعة — لا صف
-- واحد من بيانات أي مؤسسة.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_organization_stats()
RETURNS TABLE (
    organization_id uuid,
    member_count bigint,
    file_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- تثبيت search_path إلزامي مع SECURITY DEFINER: بدونه يستطيع
-- المستدعي توجيه الدالة إلى جداول يسيطر عليها.
SET search_path = public, pg_temp
AS $$
    SELECT
        o.id,
        (SELECT count(*) FROM organization_memberships m
          WHERE m.organization_id = o.id AND m.revoked_at IS NULL),
        (SELECT count(*) FROM file_objects f
          WHERE f.organization_id = o.id AND f.deleted_at IS NULL)
    FROM organizations o
    WHERE o.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION admin_organization_stats() IS
    'أعداد مجمّعة للوحة الإدارة. لا تُرجع أي صف بيانات — أرقاماً فقط.';

CREATE OR REPLACE FUNCTION admin_platform_totals()
RETURNS TABLE (
    total_users bigint,
    total_organizations bigint,
    total_active_memberships bigint,
    total_files bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        (SELECT count(*) FROM users WHERE deleted_at IS NULL),
        (SELECT count(*) FROM organizations WHERE deleted_at IS NULL),
        (SELECT count(*) FROM organization_memberships WHERE revoked_at IS NULL AND status = 'active'),
        (SELECT count(*) FROM file_objects WHERE deleted_at IS NULL);
$$;

COMMENT ON FUNCTION admin_platform_totals() IS
    'إجماليات المنصة للوحة الإدارة. أرقام فقط.';

-- ============================================================
-- سجل تدقيق الإدارة
--
-- لا RLS عليه: لا يحمل بيانات مؤسسات، وقراءته محكومة بحارس
-- PlatformAdminGuard في التطبيق. إضافة RLS هنا كانت ستمنع الكتابة
-- نفسها لأن العملية تقع خارج أي مؤسسة.
-- ============================================================

-- رايات افتراضية للبدء
INSERT INTO "feature_flags" ("key", "description", "enabled", "rollout_percentage", "created_at", "updated_at")
VALUES
    ('card_editor', 'محرر البطاقات — المرحلة 2', false, 0, now(), now()),
    ('contact_exchange', 'نموذج تبادل بيانات التواصل — المرحلة 3', false, 0, now(), now()),
    ('analytics_dashboard', 'لوحة التحليلات — المرحلة 3', false, 0, now(), now())
ON CONFLICT ("key") DO NOTHING;
