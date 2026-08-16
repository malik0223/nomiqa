-- ============================================================
-- المرحلة 4 — الهيكل التنظيمي والدعوات والاستيراد (خارطة الطريق §9.2)
-- ============================================================

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "branch_id" UUID,
ADD COLUMN     "department_id" UUID,
ADD COLUMN     "directory_visible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "employee_no" TEXT,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "job_title_en" TEXT,
ADD COLUMN     "offboarded_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "code" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'OM',
    "address_line" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_scopes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" UUID NOT NULL,
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "department_id" UUID,
    "branch_id" UUID,
    "job_title" TEXT,
    "employee_no" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "import_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_imports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "create_cards" BOOLEAN NOT NULL DEFAULT false,
    "send_invites" BOOLEAN NOT NULL DEFAULT true,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "invited_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "row_errors" JSONB,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departments_organization_id_parent_id_idx" ON "departments"("organization_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_code_key" ON "departments"("organization_id", "code");

-- CreateIndex
CREATE INDEX "branches_organization_id_idx" ON "branches"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_code_key" ON "branches"("organization_id", "code");

-- CreateIndex
CREATE INDEX "membership_scopes_organization_id_scope_type_scope_id_idx" ON "membership_scopes"("organization_id", "scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_scopes_membership_id_role_id_scope_type_scope_id_key" ON "membership_scopes"("membership_id", "role_id", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "invitations_organization_id_status_created_at_idx" ON "invitations"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "invitations_email_normalized_status_idx" ON "invitations"("email_normalized", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "employee_imports_organization_id_created_at_idx" ON "employee_imports"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "organization_memberships_organization_id_department_id_idx" ON "organization_memberships"("organization_id", "department_id");

-- CreateIndex
CREATE INDEX "organization_memberships_organization_id_branch_id_idx" ON "organization_memberships"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_employee_no_key" ON "organization_memberships"("organization_id", "employee_no");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_scopes" ADD CONSTRAINT "membership_scopes_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_scopes" ADD CONSTRAINT "membership_scopes_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "employee_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- عزل جداول الهيكل التنظيمي
--
-- الدعوات أخطرها: صف الدعوة يحمل بريد شخص وقراره بالانضمام إلى جهة
-- عمل بعينها. تسريبه بين مؤسستين يكشف «فلان يوظَّف عند فلان» قبل أن
-- يعلن هو ذلك.
--
-- membership_scopes بلا استثناء رغم أنه جدول صلاحيات: صفٌّ مزروع فيه
-- من مؤسسة أخرى يمنح تفويضاً إدارياً — أخطر من قراءة بيانات.
-- ============================================================

ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;

CREATE POLICY departments_tenant_isolation ON "departments"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;

CREATE POLICY branches_tenant_isolation ON "branches"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "membership_scopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_scopes" FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_scopes_tenant_isolation ON "membership_scopes"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_tenant_isolation ON "invitations"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "employee_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_imports" FORCE ROW LEVEL SECURITY;

CREATE POLICY employee_imports_tenant_isolation ON "employee_imports"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

-- ============================================================
-- قبول الدعوة
--
-- المدعو مصادَق عليه في Auth0 لكنه **ليس عضواً بعد**: لا مؤسسة نشطة
-- ولا صف عضوية، فسياسة invitations تحجب عنه دعوته هو نفسه.
--
-- نفس حلّ نموذج التواصل العام: دالة SECURITY DEFINER ضيقة تترجم الرمز
-- إلى وجهته. لا تكتب شيئاً، ولا تُرجع بيانات المؤسسة ولا قائمة
-- أعضائها — معرّفات وحالة الدعوة فقط. الكتابة (إنشاء العضوية) تجري
-- بعدها داخل سياق RLS عادي بالمؤسسة التي أرجعتها.
--
-- البحث بالتجزئة لا بالرمز: من يملك نسخة من هذا الجدول لا يملك رموزاً.
-- ============================================================

CREATE OR REPLACE FUNCTION invitation_by_token(token_hash_input text)
RETURNS TABLE (
    invitation_id uuid,
    organization_id uuid,
    organization_name text,
    email_normalized text,
    role_id uuid,
    department_id uuid,
    branch_id uuid,
    job_title text,
    employee_no text,
    status text,
    expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT i.id,
           i.organization_id,
           o.name,
           i.email_normalized,
           i.role_id,
           i.department_id,
           i.branch_id,
           i.job_title,
           i.employee_no,
           i.status,
           i.expires_at
    FROM invitations i
    JOIN organizations o ON o.id = i.organization_id
    WHERE i.token_hash = token_hash_input
      AND o.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION invitation_by_token(text) IS
    'وجهة دعوة برمزها المجزّأ. معرّفات وحالة فقط — لا أعضاء ولا بيانات عمل.';
