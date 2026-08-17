'use client';

/**
 * آخر شبكة أمان: خطأ وقع خارج أي تخطيط أو داخل تخطيط جذر.
 *
 * لا تعرض رسالة الخطأ للمستخدم — قد تحمل تفاصيل داخلية. المعرّف
 * `digest` هو ما يربط ما رآه المستخدم بما سُجِّل على الخادم.
 *
 * الألوان مكتوبة صراحةً لا برموز النظام: هذه الصفحة تحل محل تخطيط
 * الجذر كاملاً، وقد تُعرض قبل أن تصل أنماط التطبيق — صفحة خطأ بلا
 * أنماط أسوأ من الخطأ نفسه.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
          background: '#f7f6f2',
          color: '#161b2e',
          fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif",
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M6 13a10 10 0 0 0 20 0" stroke="#2a3d6f" strokeWidth={2.4} strokeLinecap="round" />
            <circle cx="16" cy="6.5" r="2.6" fill="#c8a24a" />
          </svg>

          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>حدث خطأ غير متوقع</h1>
          <p lang="en" dir="ltr" style={{ fontSize: '0.875rem', color: '#5b6079', margin: 0 }}>
            Something went wrong
          </p>

          {error.digest ? (
            <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#8b8fa3', margin: 0 }}>
              {`المعرّف: ${error.digest}`}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '0.5rem',
              height: '2.5rem',
              padding: '0 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#2a3d6f',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
