-- ============================================================
-- المرحلة 4 — الهوية المؤسسية وسير الموافقة (خارطة الطريق §9.3)
-- ============================================================

-- AlterTable
--
-- أعمدة التعليق هنا لا في مهاجرة الفوترة رغم أنها أداة إدارة منصة
-- (§9.5): توجيه النطاق المخصص أدناه يجب أن يرفض مؤسسة محجوبة، فلا
-- يجوز أن توجد دالة توجيه لا تعرف الحجب ولو لمهاجرة واحدة.
ALTER TABLE "organizations" ADD COLUMN     "public_access_blocked_at" TIMESTAMPTZ(6),
ADD COLUMN     "suspended_at" TIMESTAMPTZ(6),
ADD COLUMN     "suspended_by_user_id" UUID,
ADD COLUMN     "suspension_reason" TEXT;

-- CreateTable
CREATE TABLE "brand_kits" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "primary_color" TEXT,
    "secondary_color" TEXT,
    "background_color" TEXT,
    "text_color" TEXT,
    "font_family" TEXT,
    "logo_file_id" UUID,
    "cover_file_id" UUID,
    "hide_platform_badge" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "brand_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID,
    "branch_id" UUID,
    "name" TEXT NOT NULL,
    "template_key" TEXT,
    "locked_fields" TEXT[],
    "require_approval" BOOLEAN NOT NULL DEFAULT false,
    "enforced_values" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "brand_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_change_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "base_revision" INTEGER NOT NULL,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "card_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_domains" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verification_token" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "last_checked_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brand_kits_organization_id_key" ON "brand_kits"("organization_id");

-- CreateIndex
CREATE INDEX "brand_policies_organization_id_is_active_idx" ON "brand_policies"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "card_change_requests_organization_id_status_created_at_idx" ON "card_change_requests"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "card_change_requests_card_id_status_idx" ON "card_change_requests"("card_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_hostname_key" ON "custom_domains"("hostname");

-- CreateIndex
CREATE INDEX "custom_domains_organization_id_status_idx" ON "custom_domains"("organization_id", "status");

-- CreateIndex
CREATE INDEX "custom_domains_status_last_checked_at_idx" ON "custom_domains"("status", "last_checked_at");

-- AddForeignKey
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_policies" ADD CONSTRAINT "brand_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_policies" ADD CONSTRAINT "brand_policies_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_policies" ADD CONSTRAINT "brand_policies_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_change_requests" ADD CONSTRAINT "card_change_requests_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- عزل جداول الهوية المؤسسية
--
-- card_change_requests يحمل **محتوى بطاقة غير منشور** — نصاً كتبه
-- موظف ولم يوافق عليه أحد بعد. تسريبه أسوأ من تسريب بطاقة منشورة.
-- ============================================================

ALTER TABLE "brand_kits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brand_kits" FORCE ROW LEVEL SECURITY;

CREATE POLICY brand_kits_tenant_isolation ON "brand_kits"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "brand_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brand_policies" FORCE ROW LEVEL SECURITY;

CREATE POLICY brand_policies_tenant_isolation ON "brand_policies"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "card_change_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "card_change_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_change_requests_tenant_isolation ON "card_change_requests"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "custom_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_domains" FORCE ROW LEVEL SECURITY;

CREATE POLICY custom_domains_tenant_isolation ON "custom_domains"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

-- ============================================================
-- توجيه النطاق المخصص
--
-- الزائر يصل على مضيف المؤسسة بلا جلسة ولا سياق، تماماً كزائر الصفحة
-- العامة. الترجمة من المضيف إلى المؤسسة يجب أن تعمل قبل وجود أي سياق،
-- ولا تُرجع إلا ما يلزم للتوجيه — ولا تُرجع صفاً لنطاق غير مُفعَّل.
-- ============================================================

CREATE OR REPLACE FUNCTION public_domain_target(hostname_input text)
RETURNS TABLE (
    organization_id uuid,
    organization_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT d.organization_id, o.slug
    FROM custom_domains d
    JOIN organizations o ON o.id = d.organization_id
    WHERE d.hostname = lower(hostname_input)
      AND d.status = 'active'
      AND o.deleted_at IS NULL
      AND o.public_access_blocked_at IS NULL;
$$;

COMMENT ON FUNCTION public_domain_target(text) IS
    'يترجم مضيفاً مخصصاً مُفعَّلاً إلى مؤسسته. للتوجيه العام وحده.';

-- ============================================================
-- نطاقات تنتظر التحقق
--
-- التحقق يجري في الـWorker عبر كل المؤسسات (نفس علة outbox_claim_batch).
-- الدالة تُرجع ما يلزم للفحص فقط، ودالة النتيجة تكتب الحالة.
-- ============================================================

CREATE OR REPLACE FUNCTION custom_domains_due_for_check(batch_size int, min_interval interval)
RETURNS TABLE (
    id uuid,
    organization_id uuid,
    hostname text,
    verification_token text,
    attempts int
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE custom_domains d
    SET last_checked_at = now(), status = 'verifying'
    WHERE d.id IN (
        SELECT inner_d.id
        FROM custom_domains inner_d
        WHERE inner_d.status IN ('pending', 'verifying')
          AND (inner_d.last_checked_at IS NULL OR inner_d.last_checked_at <= now() - min_interval)
        ORDER BY inner_d.last_checked_at NULLS FIRST
        FOR UPDATE SKIP LOCKED
        LIMIT batch_size
    )
    RETURNING d.id, d.organization_id, d.hostname, d.verification_token, d.attempts;
$$;

CREATE OR REPLACE FUNCTION custom_domain_record_check(
    domain_id uuid,
    verified boolean,
    reason text,
    max_attempts int
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE custom_domains
    SET status = CASE
            WHEN verified THEN 'active'
            WHEN attempts + 1 >= max_attempts THEN 'failed'
            ELSE 'verifying'
        END,
        verified_at = CASE WHEN verified THEN now() ELSE verified_at END,
        failure_reason = CASE WHEN verified THEN NULL ELSE left(reason, 300) END,
        attempts = CASE WHEN verified THEN attempts ELSE attempts + 1 END,
        updated_at = now()
    WHERE id = domain_id;
$$;

COMMENT ON FUNCTION custom_domain_record_check(uuid, boolean, text, int) IS
    'يسجّل نتيجة فحص سجل TXT. للـWorker وحده.';
