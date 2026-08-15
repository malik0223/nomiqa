-- ============================================================
-- تصحيح: أسماء مفاتيح حمولة الأحداث
--
-- الخلل: `jsonb_to_recordset` تطابق المفاتيح **بالاسم حرفياً**، وكانت
-- الدالة تعلن أعمدة بأسلوب snake_case بينما الحمولة تأتي من TypeScript
-- بأسلوب camelCase (`AnalyticsIngestEvent`). النتيجة: كل الحقول عدا
-- `slug` و`type` و`locale` تصل NULL، فيُسقط كل حدث على شرطي
-- `visitor_hash IS NOT NULL` و`occurred_at BETWEEN ...`.
--
-- الأسوأ أنه **فشل صامت**: الدالة تُرجع 0 بلا خطأ، ويبدو النظام عاملاً.
--
-- الإصلاح: تعلن الدالة أسماء العقد نفسها بين علامتي اقتباس. تحويل
-- الأسماء في الـWorker كان سيترك تهجئتين لنفس الحقل — والتهجئة الثانية
-- هي بالضبط ما أنتج هذا الخلل.
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
            e."linkId",
            e."visitorHash",
            e.locale,
            e."referrerHost",
            e."deviceType",
            e."occurredAt"
        FROM jsonb_to_recordset(events) AS e(
            slug text,
            type text,
            "linkId" uuid,
            "visitorHash" text,
            locale text,
            "referrerHost" text,
            "deviceType" text,
            "occurredAt" timestamptz
        )
        JOIN cards c
          ON c.slug = e.slug
         AND c.status = 'published'
         AND c.deleted_at IS NULL
        WHERE e.type IN ('view', 'link_click', 'vcard_download', 'qr_scan', 'form_view', 'form_submit')
          AND e."visitorHash" IS NOT NULL
          -- حدث في المستقبل أو أقدم من يومين ساعةُ جهازٍ مضبوطة خطأً
          -- أو إعادة إرسال قديمة؛ قبوله يفسد التجميع بأثر رجعي.
          AND e."occurredAt" BETWEEN now() - interval '2 days' AND now() + interval '5 minutes'
        RETURNING 1
    )
    SELECT count(*)::int FROM inserted;
$$;

COMMENT ON FUNCTION analytics_ingest(jsonb) IS
    'إدراج دفعة أحداث بمفاتيح AnalyticsIngestEvent. المؤسسة تُشتق من البطاقة لا من المدخل.';
