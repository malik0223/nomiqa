-- ============================================================
-- المرحلة 5 — الحضور المهني المتكامل (خارطة الطريق §10)
--
-- ثلاث إضافات يجمعها مبدأ واحد: البطاقة تظهر في نقاط تواصل كثيرة،
-- وكلها تشير إلى الرابط الثابت نفسه. ولذلك لا يحمل أي جدول هنا نسخةً
-- من محتوى البطاقة — يحمل **إحالة** إليها فقط.
-- ============================================================

-- AlterTable
--
-- إسناد المصدر على جدول الأحداث. عمودان قابلان لـnull لا NOT NULL
-- بقيمة افتراضية: ملء 90 يوماً من الأحداث الخام بقيمة مخترعة يجعل
-- تقرير الشهر الماضي يزعم أن كل زياراته كانت مباشرة — وهو ادعاء لا
-- يملك أحد ما يثبته.
ALTER TABLE "card_events" ADD COLUMN     "campaign_id" UUID,
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE INDEX "card_events_campaign_id_occurred_at_idx" ON "card_events"("campaign_id", "occurred_at" DESC);

-- CreateTable
CREATE TABLE "nfc_tags" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "card_id" UUID,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unassigned',
    "scan_count" INTEGER NOT NULL DEFAULT 0,
    "last_scan_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,
    "revoked_by_user_id" UUID,
    "replaced_by_tag_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nfc_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "utm_source" TEXT NOT NULL,
    "utm_medium" TEXT NOT NULL,
    "utm_campaign" TEXT NOT NULL,
    "utm_term" TEXT,
    "utm_content" TEXT,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_enforced" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "signature_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_profiles" (
    "card_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_key" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_profiles_pkey" PRIMARY KEY ("card_id")
);

-- CreateTable
CREATE TABLE "wallet_passes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "auth_token" TEXT,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallet_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- الفريد على الكود **عالمي لا داخل المؤسسة**: الكود يظهر في مسار عام
-- واحد `/t/<code>`، ولو تكرر بين مؤسستين لتعذّر على المسار معرفة أيهما
-- يقصد الزائر.
CREATE UNIQUE INDEX "nfc_tags_code_key" ON "nfc_tags"("code");

-- CreateIndex
CREATE INDEX "nfc_tags_organization_id_status_idx" ON "nfc_tags"("organization_id", "status");

-- CreateIndex
CREATE INDEX "nfc_tags_card_id_idx" ON "nfc_tags"("card_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_code_key" ON "campaigns"("code");

-- CreateIndex
CREATE INDEX "campaigns_organization_id_is_active_created_at_idx" ON "campaigns"("organization_id", "is_active", "created_at" DESC);

-- CreateIndex
CREATE INDEX "campaigns_card_id_idx" ON "campaigns"("card_id");

-- CreateIndex
CREATE INDEX "signature_templates_organization_id_is_default_idx" ON "signature_templates"("organization_id", "is_default");

-- CreateIndex
CREATE INDEX "signature_profiles_organization_id_idx" ON "signature_profiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_passes_serial_number_key" ON "wallet_passes"("serial_number");

-- CreateIndex
--
-- بطاقة واحدة لكل منصة: إصدار ثانٍ لنفس البطاقة على نفس المحفظة
-- **يحدّث** الأولى ولا يضيف صفاً — وإلا صار لموظف واحد خمس بطاقات في
-- محفظته لا يعرف أيها الحالية.
CREATE UNIQUE INDEX "wallet_passes_card_id_platform_key" ON "wallet_passes"("card_id", "platform");

-- CreateIndex
CREATE INDEX "wallet_passes_organization_id_platform_idx" ON "wallet_passes"("organization_id", "platform");

-- AddForeignKey
ALTER TABLE "nfc_tags" ADD CONSTRAINT "nfc_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- SET NULL لا CASCADE: حذف بطاقة يجب ألا يمحو الوسم المادي من السجل.
-- الوسم قطعة معدنية ما زالت موجودة في العالم، وحذف صفّها يعني كوداً
-- يعمل في الشارع ولا نعرف عنه شيئاً.
ALTER TABLE "nfc_tags" ADD CONSTRAINT "nfc_tags_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_templates" ADD CONSTRAINT "signature_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_profiles" ADD CONSTRAINT "signature_profiles_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- عزل جداول الحضور
--
-- `wallet_passes` يحمل `auth_token` — رمزاً يمنح حاملَه حق استدعاء
-- خدمة تحديث البطاقة في المحفظة. تسريبه أخطر من تسريب بطاقة منشورة:
-- البطاقة محتوى عام، والرمز مفتاح كتابة.
-- ============================================================

ALTER TABLE "nfc_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nfc_tags" FORCE ROW LEVEL SECURITY;

CREATE POLICY nfc_tags_tenant_isolation ON "nfc_tags"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;

CREATE POLICY campaigns_tenant_isolation ON "campaigns"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "signature_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_templates" FORCE ROW LEVEL SECURITY;

CREATE POLICY signature_templates_tenant_isolation ON "signature_templates"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "signature_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_profiles" FORCE ROW LEVEL SECURITY;

CREATE POLICY signature_profiles_tenant_isolation ON "signature_profiles"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "wallet_passes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_passes" FORCE ROW LEVEL SECURITY;

CREATE POLICY wallet_passes_tenant_isolation ON "wallet_passes"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

-- ============================================================
-- حل الكود القصير
--
-- الزائر يصل على `/t/<code>` من وسم NFC في يده أو رمز مطبوع على
-- لافتة: **بلا جلسة وبلا سياق مؤسسة**، تماماً كزائر الصفحة العامة.
-- فالترجمة من كود إلى بطاقة يجب أن تعمل قبل وجود أي سياق.
--
-- الدالة VOLATILE لا STABLE لأنها تكتب: عدّاد مسح الوسم يُحدَّث في
-- الاستدعاء نفسه. عدّاد منفصل عن card_events عمداً — الأول يجيب
-- «هل يعمل هذا الوسم؟» ويظل يجيب بعد حذف الأحداث الخام، والثاني
-- تحليل يخضع لسياسة الاحتفاظ.
--
-- ما لا تُرجعه أهم مما تُرجعه: لا اسم صاحب البطاقة ولا اسم المؤسسة
-- ولا اسم الحملة. كود مقروء من وسم ملقى على طاولة لا يكشف أكثر مما
-- يكشفه فتح البطاقة نفسها.
-- ============================================================

CREATE OR REPLACE FUNCTION public_share_target(code_input text)
RETURNS TABLE (
    kind text,
    slug text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    normalized text := lower(trim(code_input));
BEGIN
    RETURN QUERY
    WITH scanned AS (
        UPDATE nfc_tags t
        SET scan_count = t.scan_count + 1,
            last_scan_at = now()
        WHERE t.code = normalized
          AND t.status = 'active'
          AND t.card_id IS NOT NULL
        RETURNING t.card_id
    )
    SELECT
        'nfc'::text,
        c.slug,
        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text
    FROM scanned s
    JOIN cards c ON c.id = s.card_id
    JOIN organizations o ON o.id = c.organization_id
    WHERE c.status = 'published'
      AND c.deleted_at IS NULL
      AND o.deleted_at IS NULL
      AND o.public_access_blocked_at IS NULL;

    IF FOUND THEN
        RETURN;
    END IF;

    -- الحملة: النافذة الزمنية تحكم **الإسناد** لا الوصول. حملة انتهت
    -- تُوجّه إلى البطاقة بلا معاملات UTM بدل أن تُقابَل بـ404: اللافتة
    -- المطبوعة تبقى معلّقة بعد نهاية الحملة، وزائرها يستحق البطاقة.
    RETURN QUERY
    WITH matched AS (
        SELECT
            k.*,
            k.is_active
              AND (k.starts_at IS NULL OR k.starts_at <= now())
              AND (k.ends_at IS NULL OR k.ends_at > now()) AS running
        FROM campaigns k
        WHERE k.code = normalized
    )
    SELECT
        'campaign'::text,
        c.slug,
        CASE WHEN m.running THEN m.utm_source END,
        CASE WHEN m.running THEN m.utm_medium END,
        CASE WHEN m.running THEN m.utm_campaign END,
        CASE WHEN m.running THEN m.utm_term END,
        CASE WHEN m.running THEN m.utm_content END
    FROM matched m
    JOIN cards c ON c.id = m.card_id
    JOIN organizations o ON o.id = c.organization_id
    WHERE c.status = 'published'
      AND c.deleted_at IS NULL
      AND o.deleted_at IS NULL
      AND o.public_access_blocked_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public_share_target(text) IS
    'يترجم كوداً قصيراً إلى بطاقته ومعاملات إسنادها. للتوجيه العام وحده.';

-- ============================================================
-- إدراج الأحداث مع الإسناد
--
-- تحلّ الدالة كود الحملة بنفسها بدل أن يرسل العميل معرّفاً: مسار
-- الاستقبال العام لا يستعلم عن شيء — وهو الشرط الذي أبقى تحميل
-- الصفحة العامة رخيصاً منذ المرحلة 3.
--
-- والأهم: كود لا يقابله حملة نشطة يسقط إلى NULL ولا يُسقط الحدث.
-- الزيارة وقعت فعلاً، وإسنادها الخاطئ لا يبرر محوها.
--
-- **الأعمدة بـcamelCase مقتبسة** — القاعدة التي أرستها مهاجرة
-- `20260816020000_analytics_ingest_keys`: الحمولة تأتي من `AnalyticsIngestEvent`
-- و`jsonb_to_recordset` تطابق بالاسم حرفياً، وتحويل الأسماء في
-- الـWorker يترك تهجئتين لنفس الحقل — وهي بالضبط ما أنتج ذلك الخلل.
-- أي تعديل لاحق على هذه الدالة يجب أن يبقي على التهجئة نفسها.
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_ingest(events jsonb)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH inserted AS (
        INSERT INTO card_events (
            id, organization_id, card_id, type, link_id,
            visitor_hash, locale, referrer_host, device_type,
            source, campaign_id, occurred_at
        )
        SELECT
            gen_random_uuid(),
            c.organization_id,
            c.id,
            e.type,
            e."linkId",
            e."visitorHash",
            e.locale,
            e."referrerHost",
            e."deviceType",
            e.source,
            k.id,
            e."occurredAt"
        FROM jsonb_to_recordset(events) AS e(
            slug text,
            type text,
            "linkId" uuid,
            "visitorHash" text,
            locale text,
            "referrerHost" text,
            "deviceType" text,
            source text,
            "campaignCode" text,
            "occurredAt" timestamptz
        )
        JOIN cards c
          ON c.slug = e.slug
         AND c.status = 'published'
         AND c.deleted_at IS NULL
        -- LEFT JOIN: Ø§ÙØ­ÙÙØ© Ø¥Ø³ÙØ§Ø¯ Ø§Ø®ØªÙØ§Ø±Ù ÙØ§ Ø´Ø±Ø· Ø¥Ø¯Ø±Ø§Ø¬.
        LEFT JOIN campaigns k
          ON k.code = e."campaignCode"
         AND k.card_id = c.id
        WHERE e.type IN ('view', 'link_click', 'vcard_download', 'qr_scan', 'form_view', 'form_submit')
          AND e."visitorHash" IS NOT NULL
          AND (e.source IS NULL OR e.source IN ('direct', 'qr', 'nfc', 'campaign', 'signature', 'wallet', 'meeting'))
          -- Ø­Ø¯Ø« ÙÙ Ø§ÙÙØ³ØªÙØ¨Ù Ø£Ù Ø£ÙØ¯Ù ÙÙ ÙÙÙÙÙ Ø³Ø§Ø¹Ø©Ù Ø¬ÙØ§Ø²Ù ÙØ¶Ø¨ÙØ·Ø© Ø®Ø·Ø£Ù
          -- Ø£Ù Ø¥Ø¹Ø§Ø¯Ø© Ø¥Ø±Ø³Ø§Ù ÙØ¯ÙÙØ©Ø ÙØ¨ÙÙÙ ÙÙØ³Ø¯ Ø§ÙØªØ¬ÙÙØ¹ Ø¨Ø£Ø«Ø± Ø±Ø¬Ø¹Ù.
          AND e."occurredAt" BETWEEN now() - interval '2 days' AND now() + interval '5 minutes'
        RETURNING 1
    )
    SELECT count(*)::int FROM inserted;
$$;

COMMENT ON FUNCTION analytics_ingest(jsonb) IS
    'Ø¥Ø¯Ø±Ø§Ø¬ Ø¯ÙØ¹Ø© Ø£Ø­Ø¯Ø§Ø« Ø¨ÙÙØ§ØªÙØ­ AnalyticsIngestEvent ÙØ¹ Ø¥Ø³ÙØ§Ø¯ Ø§ÙÙØµØ¯Ø±. Ø§ÙÙØ¤Ø³Ø³Ø© ÙØ§ÙØ­ÙÙØ© ØªÙØ´ØªÙØ§Ù ÙÙ Ø§ÙØ®Ø§Ø¯Ù.';

-- ============================================================
-- تجميع الإسناد
--
-- الحملة تُقاس من التجميعات لا من الأحداث الخام: الأحداث تُحذف بعد 90
-- يوماً بحكم تقليل البيانات، وتقرير حملة انتهت يجب أن يبقى بعدها.
--
-- أربعة مقاييس جديدة تسكن الجدول نفسه بعمود البُعد الموجود أصلاً. جدول
-- ثانٍ كان يعني دورة تجميع ثانية تسقط وحدها دون أن يلاحظ أحد.
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_rollup_range(
    bucket_kind text,
    range_start timestamptz,
    range_end timestamptz
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    written integer := 0;
    batch integer;
BEGIN
    IF bucket_kind NOT IN ('hour', 'day') THEN
        RAISE EXCEPTION 'سلة غير مدعومة: %', bucket_kind;
    END IF;

    -- عدّادات الأحداث، مع معرّف الرابط بُعداً للنقرات وحدها.
    INSERT INTO analytics_rollups (
        organization_id, card_id, bucket, bucket_start, metric, dimension, count, updated_at
    )
    SELECT
        e.organization_id,
        e.card_id,
        bucket_kind,
        date_trunc(bucket_kind, e.occurred_at),
        e.type,
        CASE WHEN e.type = 'link_click' THEN coalesce(e.link_id::text, '') ELSE '' END,
        count(*)::int,
        now()
    FROM card_events e
    WHERE e.occurred_at >= range_start
      AND e.occurred_at < range_end
    GROUP BY 1, 2, 4, 5, 6
    ON CONFLICT (card_id, bucket, bucket_start, metric, dimension)
    DO UPDATE SET count = EXCLUDED.count, updated_at = now();

    GET DIAGNOSTICS batch = ROW_COUNT;
    written := written + batch;

    -- الزوار الفريدون: صف مستقل لأن قيمته ليست مجموع شيء.
    INSERT INTO analytics_rollups (
        organization_id, card_id, bucket, bucket_start, metric, dimension, count, updated_at
    )
    SELECT
        e.organization_id,
        e.card_id,
        bucket_kind,
        date_trunc(bucket_kind, e.occurred_at),
        'unique_visitor',
        '',
        count(DISTINCT e.visitor_hash)::int,
        now()
    FROM card_events e
    WHERE e.occurred_at >= range_start
      AND e.occurred_at < range_end
      AND e.type = 'view'
    GROUP BY 1, 2, 4
    ON CONFLICT (card_id, bucket, bucket_start, metric, dimension)
    DO UPDATE SET count = EXCLUDED.count, updated_at = now();

    GET DIAGNOSTICS batch = ROW_COUNT;
    written := written + batch;

    -- أداء الحملات: مشاهدة وزائر فريد ونموذج مكتمل، بالحملة بُعداً.
    INSERT INTO analytics_rollups (
        organization_id, card_id, bucket, bucket_start, metric, dimension, count, updated_at
    )
    SELECT
        e.organization_id,
        e.card_id,
        bucket_kind,
        date_trunc(bucket_kind, e.occurred_at),
        CASE
            WHEN e.type = 'form_submit' THEN 'campaign_form_submit'
            ELSE 'campaign_view'
        END,
        e.campaign_id::text,
        count(*)::int,
        now()
    FROM card_events e
    WHERE e.occurred_at >= range_start
      AND e.occurred_at < range_end
      AND e.campaign_id IS NOT NULL
      AND e.type IN ('view', 'form_submit')
    GROUP BY 1, 2, 4, 5, 6
    ON CONFLICT (card_id, bucket, bucket_start, metric, dimension)
    DO UPDATE SET count = EXCLUDED.count, updated_at = now();

    GET DIAGNOSTICS batch = ROW_COUNT;
    written := written + batch;

    INSERT INTO analytics_rollups (
        organization_id, card_id, bucket, bucket_start, metric, dimension, count, updated_at
    )
    SELECT
        e.organization_id,
        e.card_id,
        bucket_kind,
        date_trunc(bucket_kind, e.occurred_at),
        'campaign_unique',
        e.campaign_id::text,
        count(DISTINCT e.visitor_hash)::int,
        now()
    FROM card_events e
    WHERE e.occurred_at >= range_start
      AND e.occurred_at < range_end
      AND e.campaign_id IS NOT NULL
      AND e.type = 'view'
    GROUP BY 1, 2, 4, 6
    ON CONFLICT (card_id, bucket, bucket_start, metric, dimension)
    DO UPDATE SET count = EXCLUDED.count, updated_at = now();

    GET DIAGNOSTICS batch = ROW_COUNT;
    written := written + batch;

    -- توزيع المصادر: أي نقطة تواصل تجلب الزيارات فعلاً (§10.4).
    INSERT INTO analytics_rollups (
        organization_id, card_id, bucket, bucket_start, metric, dimension, count, updated_at
    )
    SELECT
        e.organization_id,
        e.card_id,
        bucket_kind,
        date_trunc(bucket_kind, e.occurred_at),
        'source_view',
        e.source,
        count(*)::int,
        now()
    FROM card_events e
    WHERE e.occurred_at >= range_start
      AND e.occurred_at < range_end
      AND e.source IS NOT NULL
      AND e.type = 'view'
    GROUP BY 1, 2, 4, 6
    ON CONFLICT (card_id, bucket, bucket_start, metric, dimension)
    DO UPDATE SET count = EXCLUDED.count, updated_at = now();

    GET DIAGNOSTICS batch = ROW_COUNT;
    RETURN written + batch;
END;
$$;

COMMENT ON FUNCTION analytics_rollup_range(text, timestamptz, timestamptz) IS
    'يعيد حساب تجميعات المدى كاملاً، بما فيها إسناد الحملات والمصادر. Idempotent.';
