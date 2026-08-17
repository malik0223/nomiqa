/**
 * بطاقة غير موجودة أو ألغي نشرها.
 *
 * نص واحد للحالتين مقصود: التفريق بينهما يكشف أن رابطاً بعينه كان
 * موجوداً ثم أُلغي، وهي معلومة تخص صاحب البطاقة لا الزائر.
 */
export default function PublicCardNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <svg width="36" height="36" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M6 13a10 10 0 0 0 20 0"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <circle cx="16" cy="6.5" r="2.6" fill="#c8a24a" />
      </svg>

      <h1 className="font-display text-lg font-bold tracking-tight">هذه البطاقة غير متاحة</h1>

      <p className="text-sm leading-7 text-neutral-500">
        قد يكون الرابط غير صحيح أو أن صاحب البطاقة أوقف نشرها.
      </p>

      <p lang="en" dir="ltr" className="text-sm text-neutral-400">
        This card is not available.
      </p>
    </main>
  );
}
