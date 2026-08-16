-- ============================================================
-- المرحلة 6 — المبيعات والفعاليات والتكاملات (خارطة الطريق §11)
--
-- ثلاث إضافات يجمعها مبدأ واحد: جهة الاتصال تصل من العالم المادي
-- (بطاقة ورقية، شارة معرض) وتغادر إلى نظام العميل (CRM، Webhook).
-- وفي الطرفين تبقى القاعدة التي أرستها المرحلة 3 سارية: **لا صف
-- بيانات شخصية بلا سند حفظ مكتوب معه في المعاملة نفسها**.
-- ============================================================

-- AlterTable
--
-- ثلاثة أعمدة على جهات الاتصال، كلها قابلة لـnull بلا قيمة افتراضية:
-- صفوف ما قبل المرحلة 6 التُقطت بلا فعالية وبلا مالك معروف، وملؤها
-- بقيمة مخترعة يجعل تقرير أول فعالية يزعم أنها جمعت كل عملاء المؤسسة
-- منذ إنشائها.
ALTER TABLE "contacts" ADD COLUMN     "event_id" UUID,
ADD COLUMN     "owner_user_id" UUID,
ADD COLUMN     "qualifiers" JSONB;

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "qualifiers" JSONB NOT NULL DEFAULT '[]',
    "cost_baisa" INTEGER,
    "target_leads" INTEGER,
    "report_sent_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_cards" (
    "event_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_cards_pkey" PRIMARY KEY ("event_id","card_id")
);

-- CreateTable
CREATE TABLE "scan_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_id" UUID,
    "file_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'business_card',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extracted" JSONB,
    "confidence" DOUBLE PRECISION,
    "error" TEXT,
    "contact_id" UUID,
    "image_deleted_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "secret" TEXT NOT NULL,
    "event_types" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "disabled_at" TIMESTAMPTZ(6),
    "disabled_reason" TEXT,
    "last_success_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "response_status" INTEGER,
    "error" TEXT,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "access_token" TEXT NOT NULL,
    "field_map" JSONB NOT NULL,
    "owner_strategy" TEXT NOT NULL DEFAULT 'capturer',
    "owner_ref" TEXT,
    "marketing_consent_only" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crm_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_sync_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "operation" TEXT,
    "remote_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crm_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_organization_id_event_id_captured_at_idx" ON "contacts"("organization_id", "event_id", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "contacts_organization_id_owner_user_id_captured_at_idx" ON "contacts"("organization_id", "owner_user_id", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "events_organization_id_starts_at_idx" ON "events"("organization_id", "starts_at" DESC);

-- CreateIndex
--
-- على النهاية لا البداية: دورة إغلاق الفعاليات تسأل «أي فعالية انتهت
-- ولم يُرسل تقريرها؟» كل ساعة، وهي القراءة الوحيدة المتكررة بلا مستخدم.
CREATE INDEX "events_organization_id_ends_at_idx" ON "events"("organization_id", "ends_at");

-- CreateIndex
CREATE INDEX "event_cards_card_id_idx" ON "event_cards"("card_id");

-- CreateIndex
CREATE INDEX "event_cards_organization_id_idx" ON "event_cards"("organization_id");

-- CreateIndex
CREATE INDEX "scan_jobs_organization_id_status_created_at_idx" ON "scan_jobs"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scan_jobs_organization_id_created_by_user_id_created_at_idx" ON "scan_jobs"("organization_id", "created_by_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scan_jobs_event_id_idx" ON "scan_jobs"("event_id");

-- CreateIndex
--
-- فريد **عالمي** لا داخل المؤسسة: المفتاح يصل في ترويسة وحده بلا سياق،
-- والبحث عن تجزئته يقع قبل أن نعرف لأي مؤسسة ينتمي.
CREATE UNIQUE INDEX "api_keys_token_hash_key" ON "api_keys"("token_hash");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_revoked_at_idx" ON "api_keys"("organization_id", "revoked_at");

-- CreateIndex
CREATE INDEX "webhook_endpoints_organization_id_is_active_idx" ON "webhook_endpoints"("organization_id", "is_active");

-- CreateIndex
--
-- الفريد على (وجهة، حدث) هو **ضمانة عدم التكرار** كلها: إعادة تشغيل
-- المرسل أو تسليم متزامن من نسختين لا يُنتج نداءً ثانياً عند العميل.
CREATE UNIQUE INDEX "webhook_deliveries_endpoint_id_event_id_key" ON "webhook_deliveries"("endpoint_id", "event_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_organization_id_created_at_idx" ON "webhook_deliveries"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "crm_connections_organization_id_provider_key" ON "crm_connections"("organization_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "crm_sync_logs_connection_id_contact_id_key" ON "crm_sync_logs"("connection_id", "contact_id");

-- CreateIndex
CREATE INDEX "crm_sync_logs_status_next_attempt_at_idx" ON "crm_sync_logs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "crm_sync_logs_organization_id_created_at_idx" ON "crm_sync_logs"("organization_id", "created_at" DESC);

-- AddForeignKey
--
-- SET NULL لا CASCADE: حذف فعالية قرار تنظيمي، ومحو جهات الاتصال التي
-- جُمعت فيها إتلافٌ لعمل فريق كامل قضى ثلاثة أيام في قاعة.
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_cards" ADD CONSTRAINT "event_cards_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_cards" ADD CONSTRAINT "event_cards_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_jobs" ADD CONSTRAINT "scan_jobs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_connections" ADD CONSTRAINT "crm_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_sync_logs" ADD CONSTRAINT "crm_sync_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "crm_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_sync_logs" ADD CONSTRAINT "crm_sync_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- عزل جداول المرحلة 6
--
-- ثلاثة من هذه الجداول تحمل **أسراراً لا بيانات عرض**:
--   · `api_keys.token_hash` — تجزئة مفتاح يفتح الـAPI بلا مستخدم.
--   · `webhook_endpoints.secret` — مفتاح توقيع نوقّع به نيابة عن المؤسسة.
--   · `crm_connections.access_token` — رمز وصول إلى نظام **طرف ثالث**،
--     أي أن تسريبه يمس عميلاً لا يعرف بوجودنا في المسار.
--
-- والباقي يحمل بيانات عملاء محتملين. سياسة واحدة على كل صف، بلا
-- استثناء لأي مسار قراءة.
-- ============================================================

ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;

CREATE POLICY events_tenant_isolation ON "events"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "event_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_cards" FORCE ROW LEVEL SECURITY;

CREATE POLICY event_cards_tenant_isolation ON "event_cards"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "scan_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scan_jobs" FORCE ROW LEVEL SECURITY;

CREATE POLICY scan_jobs_tenant_isolation ON "scan_jobs"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;

CREATE POLICY api_keys_tenant_isolation ON "api_keys"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_endpoints_tenant_isolation ON "webhook_endpoints"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_tenant_isolation ON "webhook_deliveries"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "crm_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_connections" FORCE ROW LEVEL SECURITY;

CREATE POLICY crm_connections_tenant_isolation ON "crm_connections"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "crm_sync_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_sync_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY crm_sync_logs_tenant_isolation ON "crm_sync_logs"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

-- ============================================================
-- إسناد الفعالية عند الالتقاط
--
-- الفعالية تُشتق من **البطاقة ونافذتها الزمنية**، لا من مدخل الزائر
-- ولا من مدخل العميل — القاعدة 17 في README، وهي نفسها التي تحكم
-- اشتقاق المؤسسة من الـslug واشتقاق الحملة من كودها.
--
-- دالة مستقلة لا استعلام في الخدمة: مسار الالتقاط العام يعمل بلا سياق
-- مؤسسة، ونسختان من شرط النافذة — واحدة في SQL وأخرى في TypeScript —
-- كانتا ستفترقان أول مرة يُعدَّل أحدهما.
--
-- STABLE لا VOLATILE: قراءة محضة، فيجوز للمخطِّط أن يستدعيها مرة واحدة
-- لكل صف بدل مرة لكل إشارة.
-- ============================================================

CREATE OR REPLACE FUNCTION card_event_at(card_input uuid, moment timestamptz)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT e.id
    FROM event_cards ec
    JOIN events e ON e.id = ec.event_id
    WHERE ec.card_id = card_input
      AND e.starts_at <= moment
      AND e.ends_at >= moment
    -- الأحدث بداية عند التداخل: مؤسسة تشارك في معرضين متداخلين
    -- ببطاقة واحدة حالة نادرة، واختيار «الأقرب بدايةً» هو الأقرب إلى
    -- ما يقصده من ربط البطاقة بالفعالية الجارية للتو.
    ORDER BY e.starts_at DESC
    LIMIT 1;
$$;

COMMENT ON FUNCTION card_event_at(uuid, timestamptz) IS
    'الفعالية التي تنتمي إليها بطاقة في لحظة بعينها. للإسناد الآلي عند الالتقاط.';
