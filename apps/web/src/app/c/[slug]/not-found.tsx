/**
 * بطاقة غير موجودة أو ألغي نشرها.
 *
 * نص واحد للحالتين مقصود: التفريق بينهما يكشف أن رابطاً بعينه كان
 * موجوداً ثم أُلغي، وهي معلومة تخص صاحب البطاقة لا الزائر.
 */
export default function PublicCardNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold">هذه البطاقة غير متاحة</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        قد يكون الرابط غير صحيح أو أن صاحب البطاقة أوقف نشرها.
      </p>
      <p lang="en" dir="ltr" className="text-sm text-neutral-600 dark:text-neutral-400">
        This card is not available.
      </p>
    </main>
  );
}
