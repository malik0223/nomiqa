-- ============================================================
-- المرحلة 4 — الاشتراكات والفوترة والدعم (خارطة الطريق §9.4 و§9.5)
-- ============================================================

-- AlterTable
--
-- أعمدة التعليق أُضيفت في مهاجرة الهوية المؤسسية لأن دالة توجيه
-- النطاق المخصص تقرؤها.
ALTER TABLE "organizations" ADD COLUMN     "billing_address" TEXT,
ADD COLUMN     "billing_country" TEXT NOT NULL DEFAULT 'OM',
ADD COLUMN     "billing_email" TEXT,
ADD COLUMN     "billing_name" TEXT,
ADD COLUMN     "billing_vat_number" TEXT;

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "description" TEXT,
    "description_en" TEXT,
    "limits" JSONB NOT NULL,
    "features" TEXT[],
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_prices" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "interval" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'OMR',
    "amount_baisa" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "price_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "current_period_start" TIMESTAMPTZ(6) NOT NULL,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "trial_ends_at" TIMESTAMPTZ(6),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMPTZ(6),
    "grace_period_ends_at" TIMESTAMPTZ(6),
    "coupon_id" UUID,
    "provider_customer_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "from_plan_id" UUID,
    "to_plan_id" UUID,
    "actor_user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'OMR',
    "subtotal_baisa" INTEGER NOT NULL,
    "discount_baisa" INTEGER NOT NULL DEFAULT 0,
    "vat_rate_bps" INTEGER NOT NULL DEFAULT 500,
    "vat_baisa" INTEGER NOT NULL DEFAULT 0,
    "total_baisa" INTEGER NOT NULL,
    "amount_paid_baisa" INTEGER NOT NULL DEFAULT 0,
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "issued_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "voided_at" TIMESTAMPTZ(6),
    "billing_name" TEXT,
    "billing_email" TEXT,
    "billing_vat_number" TEXT,
    "billing_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "description_en" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_amount_baisa" INTEGER NOT NULL,
    "amount_baisa" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID,
    "provider" TEXT NOT NULL DEFAULT 'thawani',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "client_reference_id" TEXT NOT NULL,
    "provider_session_id" TEXT,
    "provider_payment_id" TEXT,
    "amount_baisa" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'OMR',
    "checkout_url" TEXT,
    "raw_status" TEXT,
    "failure_reason" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payment_id" UUID,
    "outcome" TEXT NOT NULL DEFAULT 'received',
    "payload" JSONB,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "currency" TEXT DEFAULT 'OMR',
    "duration_cycles" INTEGER,
    "max_redemptions" INTEGER,
    "redeemed_count" INTEGER NOT NULL DEFAULT 0,
    "applies_to_plan_keys" TEXT[],
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID,
    "cycles_used" INTEGER NOT NULL DEFAULT 0,
    "redeemed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigned_admin_user_id" UUID,
    "first_response_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_user_id" UUID,
    "author_type" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "plan_prices_plan_id_interval_currency_key" ON "plan_prices"("plan_id", "interval", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE INDEX "subscription_events_organization_id_created_at_idx" ON "subscription_events"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "subscription_events_type_created_at_idx" ON "subscription_events"("type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_organization_id_issued_at_idx" ON "invoices"("organization_id", "issued_at" DESC);

-- CreateIndex
CREATE INDEX "invoices_status_due_at_idx" ON "invoices"("status", "due_at");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_client_reference_id_key" ON "payments"("client_reference_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_created_at_idx" ON "payments"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "payments_provider_session_id_idx" ON "payments"("provider_session_id");

-- CreateIndex
CREATE INDEX "payment_events_received_at_idx" ON "payment_events"("received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_external_id_event_type_key" ON "payment_events"("provider", "external_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupon_redemptions_organization_id_idx" ON "coupon_redemptions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_coupon_id_organization_id_key" ON "coupon_redemptions"("coupon_id", "organization_id");

-- CreateIndex
CREATE INDEX "support_tickets_organization_id_status_created_at_idx" ON "support_tickets"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_created_at_idx" ON "support_tickets"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_id_fkey" FOREIGN KEY ("price_id") REFERENCES "plan_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- عزل جداول الفوترة والدعم
--
-- plans وplan_prices وcoupons وpayment_events **بلا RLS عمداً**:
-- الباقات والأسعار وأكواد الخصم كتالوج عام تقرؤه كل مؤسسة (كما
-- templates وpermissions)، وpayment_events يصل قبل معرفة المؤسسة.
--
-- ما عداها يحمل مالاً وبيانات مشترٍ: الفواتير والمدفوعات مستندات
-- محاسبية، وتسريب فاتورة يكشف حجم عمل منافس وسعره المتفاوض عليه.
-- ============================================================

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_tenant_isolation ON "subscriptions"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "subscription_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY subscription_events_tenant_isolation ON "subscription_events"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;

CREATE POLICY invoices_tenant_isolation ON "invoices"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;

CREATE POLICY invoice_lines_tenant_isolation ON "invoice_lines"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;

CREATE POLICY payments_tenant_isolation ON "payments"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "coupon_redemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupon_redemptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY coupon_redemptions_tenant_isolation ON "coupon_redemptions"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_tickets" FORCE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_tenant_isolation ON "support_tickets"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_messages" FORCE ROW LEVEL SECURITY;

CREATE POLICY support_messages_tenant_isolation ON "support_messages"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

-- ============================================================
-- ترقيم الفواتير
--
-- تسلسل قاعدة بيانات لا عدّاد في التطبيق: رقم الفاتورة يجب ألا يتكرر
-- ولا ينكسر تسلسله ولو أصدرت عشر نسخ من الـAPI فواتير في اللحظة نفسها.
-- التسلسل **عالمي لا لكل مؤسسة**: أرقام متسلسلة داخل كل مؤسسة تكشف
-- لها عدد فواتيرها فحسب، لكنها تفرض عدّاداً مقفلاً لكل صف يُصدر.
--
-- الفجوات في التسلسل مقبولة ومتوقعة (معاملة تراجعت) — التسلسل يضمن
-- التفرّد لا الاتصال.
-- ============================================================

CREATE SEQUENCE invoice_number_seq START WITH 1;

-- التسلسل ليس جدولاً: منح `ON ALL TABLES` لا يشمله، ودور التطبيق بلا
-- USAGE عليه يفشل عند أول `nextval` — أي عند إصدار أول فاتورة. المنح
-- هنا لا في وثيقة تشغيل: هذا أول تسلسل في المخطط، وربطه بالمهاجرة
-- التي أنشأته يمنع نسيانه عند تهيئة بيئة جديدة.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nomiqa_app') THEN
        GRANT USAGE, SELECT ON SEQUENCE invoice_number_seq TO nomiqa_app;
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
    SELECT 'NOM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');
$$;

COMMENT ON FUNCTION next_invoice_number() IS
    'رقم فاتورة فريد بصيغة NOM-YYYY-000123.';

-- ============================================================
-- دورة التجديد
--
-- التجديد يعمل في الـWorker عبر كل المؤسسات (نفس علة outbox_claim_batch).
-- الدالة تُرجع **معرّفات فقط**، ثم يضبط الـWorker سياق كل مؤسسة وينفّذ
-- بقية العمل تحت RLS عادية — فلا تُفتح ثغرة قراءة شاملة للفواتير.
-- ============================================================

CREATE OR REPLACE FUNCTION billing_subscriptions_due(lookahead interval, batch_size int)
RETURNS TABLE (
    subscription_id uuid,
    organization_id uuid,
    status text,
    current_period_end timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT s.id, s.organization_id, s.status, s.current_period_end
    FROM subscriptions s
    WHERE s.status IN ('active', 'trialing', 'past_due')
      AND s.current_period_end <= now() + lookahead
    ORDER BY s.current_period_end
    LIMIT batch_size;
$$;

COMMENT ON FUNCTION billing_subscriptions_due(interval, int) IS
    'اشتراكات تقترب نهاية فترتها. معرّفات فقط — للـWorker.';

CREATE OR REPLACE FUNCTION billing_subscriptions_overdue(batch_size int)
RETURNS TABLE (
    subscription_id uuid,
    organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT s.id, s.organization_id
    FROM subscriptions s
    WHERE s.status = 'past_due'
      AND s.grace_period_ends_at IS NOT NULL
      AND s.grace_period_ends_at <= now()
    ORDER BY s.grace_period_ends_at
    LIMIT batch_size;
$$;

-- يترجم مرجع دفعة إلى مؤسستها.
--
-- النداء الراجع من المزوّد يصل بلا جلسة ولا مؤسسة، ويحمل معرّف الجلسة
-- وحده. هذه الدالة تُرجع الوجهة فقط؛ التحقق من أن الدفع تم فعلاً يجري
-- باستعلام المزوّد لا بتصديق ما وصل في الجسم.
CREATE OR REPLACE FUNCTION payment_target_by_reference(reference text)
RETURNS TABLE (
    payment_id uuid,
    organization_id uuid,
    status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p.id, p.organization_id, p.status
    FROM payments p
    WHERE p.client_reference_id = reference;
$$;

COMMENT ON FUNCTION payment_target_by_reference(text) IS
    'وجهة دفعة بمرجعها. معرّفات وحالة فقط — للنداء الراجع من المزوّد.';

-- ============================================================
-- تقارير المنصة (§9.5)
--
-- أرقام مجمّعة فقط، على نسق admin_platform_totals: لوحة الإدارة لا
-- تقرأ بيانات أعمال مؤسسة، وتقرير الإيراد لا يحتاج أكثر من مجاميع.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_revenue_totals(from_ts timestamptz, to_ts timestamptz)
RETURNS TABLE (
    currency text,
    paid_invoices bigint,
    paid_baisa numeric,
    vat_baisa numeric,
    discount_baisa numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT i.currency,
           count(*)::bigint,
           coalesce(sum(i.total_baisa), 0),
           coalesce(sum(i.vat_baisa), 0),
           coalesce(sum(i.discount_baisa), 0)
    FROM invoices i
    WHERE i.status = 'paid'
      AND i.paid_at >= from_ts
      AND i.paid_at < to_ts
    GROUP BY i.currency;
$$;

CREATE OR REPLACE FUNCTION admin_subscription_stats()
RETURNS TABLE (
    plan_key text,
    status text,
    subscription_count bigint,
    seats bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p.key, s.status, count(*)::bigint, coalesce(sum(s.quantity), 0)::bigint
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    GROUP BY p.key, s.status;
$$;

CREATE OR REPLACE FUNCTION admin_revenue_by_month(months int)
RETURNS TABLE (
    month date,
    currency text,
    paid_baisa numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT date_trunc('month', i.paid_at)::date, i.currency, coalesce(sum(i.total_baisa), 0)
    FROM invoices i
    WHERE i.status = 'paid'
      AND i.paid_at >= date_trunc('month', now()) - (months || ' months')::interval
    GROUP BY 1, 2
    ORDER BY 1;
$$;

-- ============================================================
-- تذاكر الدعم للوحة المنصة
--
-- استثناء معلن: التذكرة كُتبت قاصدةً أن يقرأها فريق المنصة. الدالة
-- تُرجع بيانات وصفية وعنوان التذكرة — لا نص الرسائل. قراءة النص تجري
-- بمسار منفصل يُسجَّل في platform_audit_logs.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_support_queue(status_filter text, batch_size int)
RETURNS TABLE (
    ticket_id uuid,
    organization_id uuid,
    organization_slug text,
    subject text,
    category text,
    priority text,
    status text,
    message_count bigint,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT t.id,
           t.organization_id,
           o.slug,
           t.subject,
           t.category,
           t.priority,
           t.status,
           (SELECT count(*) FROM support_messages m WHERE m.ticket_id = t.id),
           t.created_at,
           t.updated_at
    FROM support_tickets t
    JOIN organizations o ON o.id = t.organization_id
    WHERE status_filter IS NULL OR t.status = status_filter
    ORDER BY
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        t.created_at
    LIMIT batch_size;
$$;

CREATE OR REPLACE FUNCTION admin_ticket_messages(ticket uuid)
RETURNS TABLE (
    message_id uuid,
    author_type text,
    is_internal boolean,
    body text,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT m.id, m.author_type, m.is_internal, m.body, m.created_at
    FROM support_messages m
    WHERE m.ticket_id = ticket
    ORDER BY m.created_at;
$$;

CREATE OR REPLACE FUNCTION admin_reply_to_ticket(
    ticket uuid,
    admin_user uuid,
    message_body text,
    internal boolean
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_org uuid;
    new_id uuid;
BEGIN
    SELECT organization_id INTO target_org FROM support_tickets WHERE id = ticket;
    IF target_org IS NULL THEN
        RAISE EXCEPTION 'التذكرة غير موجودة';
    END IF;

    INSERT INTO support_messages (id, organization_id, ticket_id, author_user_id, author_type, body, is_internal)
    VALUES (gen_random_uuid(), target_org, ticket, admin_user, 'platform', message_body, internal)
    RETURNING id INTO new_id;

    UPDATE support_tickets
    SET status = CASE WHEN internal THEN status ELSE 'pending_customer' END,
        first_response_at = coalesce(first_response_at, CASE WHEN internal THEN NULL ELSE now() END),
        updated_at = now()
    WHERE id = ticket;

    RETURN new_id;
END;
$$;

COMMENT ON FUNCTION admin_reply_to_ticket(uuid, uuid, text, boolean) IS
    'رد فريق المنصة على تذكرة. يكتب في مؤسسة التذكرة دون سياق RLS.';
