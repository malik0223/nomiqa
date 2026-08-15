-- CreateTable
CREATE TABLE "card_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "link_id" UUID,
    "visitor_hash" TEXT NOT NULL,
    "locale" TEXT,
    "referrer_host" TEXT,
    "device_type" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_rollups" (
    "organization_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "bucket_start" TIMESTAMPTZ(6) NOT NULL,
    "metric" TEXT NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analytics_rollups_pkey" PRIMARY KEY ("card_id","bucket","bucket_start","metric","dimension")
);

-- CreateIndex
CREATE INDEX "card_events_card_id_occurred_at_idx" ON "card_events"("card_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "card_events_card_id_type_occurred_at_idx" ON "card_events"("card_id", "type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "card_events_organization_id_occurred_at_idx" ON "card_events"("organization_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "card_events_occurred_at_idx" ON "card_events"("occurred_at");

-- CreateIndex
CREATE INDEX "analytics_rollups_organization_id_bucket_bucket_start_idx" ON "analytics_rollups"("organization_id", "bucket", "bucket_start");

-- CreateIndex
CREATE INDEX "analytics_rollups_card_id_bucket_metric_bucket_start_idx" ON "analytics_rollups"("card_id", "bucket", "metric", "bucket_start");

-- ============================================================
-- عزل التحليلات
--
-- الجدولان يحملان organization_id مباشرة. لا مفاتيح أجنبية إلى cards
-- عمداً: card_events عالي الحجم، والتحقق عند كل إدراج يضاعف كلفة صف
-- لا يحمي شيئاً — والدالة التي تكتبه تتحقق من البطاقة أصلاً.
-- ============================================================

ALTER TABLE "card_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "card_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_events_tenant_isolation ON "card_events"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "analytics_rollups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_rollups" FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_rollups_tenant_isolation ON "analytics_rollups"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

-- ============================================================
-- إدراج الأحداث على دفعات
--
-- الأحداث تصل من زوار مجهولين على بطاقات تخص مؤسسات مختلفة، والدفعة
-- الواحدة قد تخلط بينها. تنفيذها داخل سياق RLS يعني معاملة لكل مؤسسة.
--
-- الدالة تحلّ الـslug إلى بطاقته وتشتق organization_id من الصف نفسه:
-- **العميل لا يرسل معرّف مؤسسة ولا معرّف بطاقة إطلاقاً**، فلا يستطيع
-- حقن أحداث في مؤسسة يختارها. الأحداث التي لا يقابلها slug منشور
-- تُسقط بصمت — وهي الحالة الطبيعية لبطاقة أُلغي نشرها.
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
            visitor_hash, locale, referrer_host, device_type, occurred_at
        )
        SELECT
            gen_random_uuid(),
            c.organization_id,
            c.id,
            e.type,
            e.link_id,
            e.visitor_hash,
            e.locale,
            e.referrer_host,
            e.device_type,
            e.occurred_at
        FROM jsonb_to_recordset(events) AS e(
            slug text,
            type text,
            link_id uuid,
            visitor_hash text,
            locale text,
            referrer_host text,
            device_type text,
            occurred_at timestamptz
        )
        JOIN cards c
          ON c.slug = e.slug
         AND c.status = 'published'
         AND c.deleted_at IS NULL
        WHERE e.type IN ('view', 'link_click', 'vcard_download', 'qr_scan', 'form_view', 'form_submit')
          AND e.visitor_hash IS NOT NULL
          -- حدث في المستقبل أو أقدم من يومين ساعةُ جهازٍ مضبوطة خطأً
          -- أو إعادة إرسال قديمة؛ قبوله يفسد التجميع بأثر رجعي.
          AND e.occurred_at BETWEEN now() - interval '2 days' AND now() + interval '5 minutes'
        RETURNING 1
    )
    SELECT count(*)::int FROM inserted;
$$;

COMMENT ON FUNCTION analytics_ingest(jsonb) IS
    'إدراج دفعة أحداث. المؤسسة تُشتق من البطاقة لا من المدخل. للـWorker وحده.';

-- ============================================================
-- التجميع
--
-- يُعاد حساب المدى المطلوب كاملاً في كل مرة بـON CONFLICT DO UPDATE —
-- لا زيادة تراكمية. الفارق مهم: التجميع التراكمي يضاعف الأعداد عند
-- إعادة تشغيل مهمة، وهو ما يحدث حتماً في نظام له سياسة إعادة محاولة.
--
-- unique_visitor يُحسب بـCOUNT(DISTINCT) داخل كل سلة على حدة، ولذلك
-- **لا يُجمع مجموع السلال**: زائر عاد في يومين يُعدّ مرة في كل يوم.
-- الفترة الأطول تُحسب من الأحداث الخام مباشرة — راجع
-- docs/analytics/definitions.md.
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
    RETURN written + batch;
END;
$$;

COMMENT ON FUNCTION analytics_rollup_range(text, timestamptz, timestamptz) IS
    'يعيد حساب تجميعات المدى كاملاً. Idempotent — إعادة التشغيل لا تضاعف الأعداد.';

-- ============================================================
-- سياسة الاحتفاظ بالأحداث الخام
--
-- الصف الخام يحمل تجزئة زائر ونطاق مُحيل ونوع جهاز. لا شيء منها
-- يعرّف شخصاً بذاته، لكن الاحتفاظ بها إلى الأبد بلا غرض يخالف مبدأ
-- تقليل البيانات: بعد التجميع لا تضيف قيمة تشغيلية.
--
-- التجميعات تبقى — أعداد مجرّدة لا تخص أحداً.
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_purge_events(older_than_days int)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    removed integer;
BEGIN
    DELETE FROM card_events
    WHERE occurred_at < now() - (older_than_days || ' days')::interval;

    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed;
END;
$$;

COMMENT ON FUNCTION analytics_purge_events(int) IS
    'يحذف الأحداث الخام الأقدم من المدة المحددة. التجميعات تبقى.';
