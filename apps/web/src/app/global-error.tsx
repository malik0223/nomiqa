'use client';

/**
 * آخر شبكة أمان: خطأ وقع خارج أي تخطيط أو داخل تخطيط جذر.
 *
 * لا تعرض رسالة الخطأ للمستخدم — قد تحمل تفاصيل داخلية. المعرّف
 * `digest` هو ما يربط ما رآه المستخدم بما سُجِّل على الخادم.
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
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-xl font-bold">حدث خطأ غير متوقع</h1>
          <p lang="en" dir="ltr" className="text-sm text-neutral-600">
            Something went wrong
          </p>

          {error.digest ? (
            <p className="font-mono text-xs text-neutral-500">{`المعرّف: ${error.digest}`}</p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            className="mt-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
