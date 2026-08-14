-- CreateTable
CREATE TABLE "user_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "document_version" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "subject_email_hash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "outcome" JSONB,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_consents_user_id_purpose_created_at_idx" ON "user_consents"("user_id", "purpose", "created_at" DESC);

-- CreateIndex
CREATE INDEX "data_subject_requests_subject_user_id_requested_at_idx" ON "data_subject_requests"("subject_user_id", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "data_subject_requests_status_requested_at_idx" ON "data_subject_requests"("status", "requested_at");

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- عزل بيانات الخصوصية
--
-- هذه الجداول مقيّدة بالمستخدم لا بالمؤسسة، فتستخدم سياق
-- app.user_id بدل app.organization_id.
-- ============================================================

ALTER TABLE "user_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_consents" FORCE ROW LEVEL SECURITY;

-- الموافقات تخص صاحبها وحده. لا يراها عضو آخر ولا مسؤول مؤسسة.
CREATE POLICY consents_self_access ON "user_consents"
    USING ("user_id" = app_current_user_id())
    WITH CHECK ("user_id" = app_current_user_id());

ALTER TABLE "data_subject_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_subject_requests" FORCE ROW LEVEL SECURITY;

-- صاحب الطلب يقرأ طلباته وينشئها.
CREATE POLICY dsr_self_access ON "data_subject_requests"
    USING ("subject_user_id" = app_current_user_id())
    WITH CHECK ("subject_user_id" = app_current_user_id());
-- ملاحظة: تنفيذ الحذف في الـWorker يجري بعد حذف صف المستخدم، لكن
-- السياسة تقارن العمود بقيمة الجلسة لا بصف قائم — فيكفي ضبط
-- app.user_id بمعرّف المستخدم المحذوف ليطابق طلبه. لا حاجة إلى
-- دور إداري ولا استثناء من RLS.
