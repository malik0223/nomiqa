-- AlterTable
ALTER TABLE "cards" ADD COLUMN "contact_form" JSONB;

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "card_id" UUID,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "organization_name" TEXT,
    "job_title" TEXT,
    "message" TEXT,
    "custom_fields" JSONB,
    "source" TEXT NOT NULL DEFAULT 'card_form',
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "follow_up_status" TEXT NOT NULL DEFAULT 'new',
    "follow_up_at" TIMESTAMPTZ(6),
    "email_normalized" TEXT,
    "phone_normalized" TEXT,
    "duplicate_of_id" UUID,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_consents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "consent_text_version" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'public_form',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_notes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "author_user_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contact_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "contact_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contact_id","tag_id")
);

-- CreateTable
CREATE TABLE "follow_up_tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "assigned_user_id" UUID,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "follow_up_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_organization_id_captured_at_idx" ON "contacts"("organization_id", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "contacts_organization_id_follow_up_status_captured_at_idx" ON "contacts"("organization_id", "follow_up_status", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "contacts_organization_id_card_id_captured_at_idx" ON "contacts"("organization_id", "card_id", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "contacts_organization_id_email_normalized_idx" ON "contacts"("organization_id", "email_normalized");

-- CreateIndex
CREATE INDEX "contacts_organization_id_phone_normalized_idx" ON "contacts"("organization_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "contact_consents_contact_id_purpose_created_at_idx" ON "contact_consents"("contact_id", "purpose", "created_at" DESC);

-- CreateIndex
CREATE INDEX "contact_consents_organization_id_created_at_idx" ON "contact_consents"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "contact_notes_contact_id_created_at_idx" ON "contact_notes"("contact_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_organization_id_name_key" ON "tags"("organization_id", "name");

-- CreateIndex
CREATE INDEX "contact_tags_tag_id_idx" ON "contact_tags"("tag_id");

-- CreateIndex
CREATE INDEX "follow_up_tasks_organization_id_status_due_at_idx" ON "follow_up_tasks"("organization_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "follow_up_tasks_contact_id_due_at_idx" ON "follow_up_tasks"("contact_id", "due_at");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_consents" ADD CONSTRAINT "contact_consents_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- عزل جهات الاتصال
--
-- هذه أثقل بيانات المنصة حساسيةً: بيانات شخصية لأطراف **لم تسجّل
-- في المنصة ولا تعرف بوجودها**، فتسريبها بين مؤسستين ليس خطأ عرضاً
-- بل خرقاً يخص أشخاصاً لا حساب لهم يشتكون منه.
--
-- contact_tags وحدها بلا organization_id — جدول وصل بحتاً — فتُعزل
-- بانتماء طرفيها معاً: جهة اتصال مرئية **و**تصنيف مرئي. اشتراط الطرفين
-- يمنع وسم جهة اتصال بتصنيف مؤسسة أخرى.
-- ============================================================

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;

CREATE POLICY contacts_tenant_isolation ON "contacts"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "contact_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_consents" FORCE ROW LEVEL SECURITY;

CREATE POLICY contact_consents_tenant_isolation ON "contact_consents"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "contact_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_notes" FORCE ROW LEVEL SECURITY;

CREATE POLICY contact_notes_tenant_isolation ON "contact_notes"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags" FORCE ROW LEVEL SECURITY;

CREATE POLICY tags_tenant_isolation ON "tags"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "follow_up_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "follow_up_tasks" FORCE ROW LEVEL SECURITY;

CREATE POLICY follow_up_tasks_tenant_isolation ON "follow_up_tasks"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "contact_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_tags" FORCE ROW LEVEL SECURITY;

CREATE POLICY contact_tags_tenant_isolation ON "contact_tags"
    USING (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = "contact_tags"."contact_id"
              AND c.organization_id = app_current_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM tags t
            WHERE t.id = "contact_tags"."tag_id"
              AND t.organization_id = app_current_organization_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.id = "contact_tags"."contact_id"
              AND c.organization_id = app_current_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM tags t
            WHERE t.id = "contact_tags"."tag_id"
              AND t.organization_id = app_current_organization_id()
        )
    );

-- ============================================================
-- وجهة النموذج العام
--
-- الزائر الذي يملأ النموذج **مجهول**: لا جلسة ولا مؤسسة نشطة. ومع ذلك
-- يجب أن يُكتب الصف في مؤسسة البطاقة بالضبط.
--
-- الحل: دالة SECURITY DEFINER تترجم الـslug إلى وجهته. لا تكتب شيئاً،
-- ولا تُرجع بيانات عمل — معرّفات وإعداد نموذج فقط — ولا تُرجع صفاً
-- لبطاقة غير منشورة. الكتابة نفسها تبقى داخل سياق RLS عادي بالمؤسسة
-- التي أرجعتها هذه الدالة، فلا يُفتح مسار كتابة يتجاوز السياسات.
-- ============================================================

CREATE OR REPLACE FUNCTION public_card_contact_target(card_slug text)
RETURNS TABLE (
    card_id uuid,
    organization_id uuid,
    owner_user_id uuid,
    contact_form jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT c.id, c.organization_id, c.owner_user_id, c.contact_form
    FROM cards c
    WHERE c.slug = card_slug
      AND c.status = 'published'
      AND c.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public_card_contact_target(text) IS
    'وجهة نموذج التواصل لبطاقة منشورة. معرّفات وإعداد نموذج فقط — لا بيانات عمل ولا صفوف مؤسسة.';

-- ============================================================
-- مطالبة أحداث Outbox
--
-- المرسل يعمل في الـWorker **عبر كل المؤسسات**، وسياسة outbox_events
-- تحجب كل صف بلا سياق مؤسسة. البدائل الثلاثة:
--
--   1. منح الـWorker دور BYPASSRLS — يفتح كل الجداول لا هذا الجدول.
--   2. المرور على المؤسسات واحدة واحدة — استعلام لكل مؤسسة كل دورة.
--   3. دالة SECURITY DEFINER بنطاق ضيق — المختارة.
--
-- المطالبة ذرّية: FOR UPDATE SKIP LOCKED مع الانتقال إلى processing في
-- نفس العبارة، فلا يلتقط عاملان الحدث نفسه ولو عملا معاً.
-- ============================================================

CREATE OR REPLACE FUNCTION outbox_claim_batch(batch_size int)
RETURNS TABLE (
    id uuid,
    organization_id uuid,
    event_type text,
    payload jsonb,
    attempts int
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE outbox_events e
    SET status = 'processing', attempts = e.attempts + 1
    WHERE e.id IN (
        SELECT inner_e.id
        FROM outbox_events inner_e
        WHERE inner_e.status = 'pending'
          AND inner_e.available_at <= now()
        ORDER BY inner_e.available_at
        FOR UPDATE SKIP LOCKED
        LIMIT batch_size
    )
    RETURNING e.id, e.organization_id, e.event_type, e.payload, e.attempts;
$$;

COMMENT ON FUNCTION outbox_claim_batch(int) IS
    'يطالب دفعة أحداث معلّقة وينقلها إلى processing ذرّياً. للـWorker وحده.';

CREATE OR REPLACE FUNCTION outbox_mark_processed(event_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE outbox_events
    SET status = 'processed', processed_at = now(), last_error = NULL
    WHERE id = event_id;
$$;

-- يعيد الحدث إلى pending بتأجيل أُسّي، أو يوسمه failed بعد استنفاد
-- المحاولات. الإرجاع إلى pending لا failed هو ما يجعل عطلاً عابراً في
-- مزوّد البريد لا يفقد إشعاراً.
CREATE OR REPLACE FUNCTION outbox_mark_failed(event_id uuid, error_text text, max_attempts int)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE outbox_events
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        last_error = left(error_text, 500),
        available_at = now() + (interval '30 seconds' * power(2, least(attempts, 6)))
    WHERE id = event_id;
$$;

COMMENT ON FUNCTION outbox_mark_failed(uuid, text, int) IS
    'يؤجّل الحدث بتأجيل أُسّي أو يوسمه failed بعد استنفاد المحاولات.';
