'use client';

import { useEffect, useRef } from 'react';

type EventType = 'view' | 'link_click' | 'vcard_download' | 'qr_scan' | 'form_view' | 'form_submit';

interface QueuedEvent {
  type: EventType;
  linkId?: string;
  locale?: string;
}

/**
 * قياس الصفحة العامة.
 *
 * القيود التي شكّلت هذا المكوّن:
 *
 *  1. **لا يؤخر الصفحة.** الصفحة العامة يُقاس نجاحها بـLCP دون ثانيتين
 *     ونصف، فالإرسال يبدأ بعد الرسم ولا ينتظره شيء.
 *  2. **لا يكسر الصفحة إن فشل.** كل استدعاء محاط بـtry وكل وعد له
 *     catch. رقم ناقص أهون من بطاقة لا تُفتح.
 *  3. **لا يعرّف الزائر.** لا كوكي ولا تخزين محلي ولا معرّف يُرسل؛
 *     التمييز يحدث في الخادم بتجزئة يومية لا رجعة فيها.
 *  4. **مستمع واحد مفوَّض** على المستند بدل مستمع لكل رابط: محرك
 *     العرض خادمي، وربط مستمع بكل رابط كان سيحوّله إلى مكوّن عميل.
 *
 * `fetch` بـ`keepalive` لا `sendBeacon`: الأخير لا يستطيع إطلاق طلب
 * تمهيدي (preflight)، وإرسال JSON عبر أصلين يستوجبه. تغيير النوع إلى
 * `text/plain` للتحايل عليه كان سيجعل الـAPI يقبل جسماً بنوع يكذب على
 * محتواه. و`keepalive` يعطي نفس الضمان: الطلب ينجو من مغادرة الصفحة.
 */
export function AnalyticsBeacon({
  slug,
  locale,
  apiUrl,
  source,
  campaignCode,
}: {
  slug: string;
  locale: string;
  apiUrl: string;
  /**
   * نقطة التواصل التي جاءت منها الزيارة (§10.4).
   *
   * تصل في `?src=` من رابط الرمز أو من إعادة توجيه `/t/<code>`. غيابها
   * زيارة مباشرة من رابط مُشارَك — ولا نخترع لها قيمة.
   */
  source?: string;
  /** كود الحملة من `?k=`. يُترجم إلى حملة في الخادم لا هنا. */
  campaignCode?: string;
}) {
  const queue = useRef<QueuedEvent[]>([]);

  useEffect(() => {
    const endpoint = `${apiUrl}/api/v1/public/cards/${encodeURIComponent(slug)}/events`;

    // الإسناد خاصية الزيارة لا الحدث: يُرسل مرة مع الدفعة لا مع كل
    // نقرة، فلا يتضاعف حجم الطلب في أكثر مسارات المنصة استدعاءً.
    const attribution =
      source || campaignCode
        ? { ...(source ? { source } : {}), ...(campaignCode ? { campaignCode } : {}) }
        : undefined;

    const flush = () => {
      const events = queue.current;
      if (events.length === 0) return;
      queue.current = [];

      try {
        void fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(attribution ? { events, attribution } : { events }),
          keepalive: true,
          // القياس لا يحمل جلسة ولا يحتاجها.
          credentials: 'omit',
        }).catch(() => undefined);
      } catch {
        // القياس ليس وظيفة الصفحة — نتجاهل الفشل بصمت.
      }
    };

    const push = (event: QueuedEvent, immediate = false) => {
      queue.current.push({ ...event, locale });
      // الدفعة تنتظر المغادرة، إلا حين يكون الحدث نفسه سبب المغادرة.
      if (immediate) flush();
    };

    // المسح من رمز مطبوع أو من وسم NFC كلاهما `qr_scan`: الحدث يقيس
    // «وصل من شيء مادي»، والتمييز بينهما موجود في بُعد المصدر.
    if (source === 'qr' || source === 'nfc') push({ type: 'qr_scan' });
    push({ type: 'view' }, true);

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLElement>('[data-link-id]');
      if (link?.dataset.linkId) {
        push({ type: 'link_click', linkId: link.dataset.linkId }, true);
        return;
      }

      const tracked = target.closest<HTMLElement>('[data-track]');
      if (tracked?.dataset.track === 'vcard') {
        push({ type: 'vcard_download' }, true);
      }
    };

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('visibilitychange', onHide);

    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [slug, locale, apiUrl, source, campaignCode]);

  return null;
}
