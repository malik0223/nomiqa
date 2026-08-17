import { cn } from './cn';

/* ============================================================
   العلامة
   ------------------------------------------------------------
   الرمز هو حرف النون: كأس ونقطة. اشتقاق مباشر من الاسم «نميقة»
   ومن الخطّ العربي نفسه، لا شكل هندسي مستورد. الكأس بالحبر
   والنقطة بالذهب — نفس قاعدة النظام: الذهب ختم صغير لا طلاء.

   يعمل عند 20px لأن الرمز خطّان فقط.
   ============================================================ */

export function Wordmark({
  size = 'md',
  showText = true,
  locale = 'ar',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  locale?: string;
  className?: string;
}) {
  const mark = size === 'sm' ? 22 : size === 'lg' ? 40 : 28;
  const text = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-base';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        width={mark}
        height={mark}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="shrink-0"
      >
        <path
          d="M6 13a10 10 0 0 0 20 0"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <circle cx="16" cy="6.5" r="2.6" fill="var(--nq-accent-line)" />
      </svg>

      {showText ? (
        <span className={cn('font-display font-bold tracking-tight', text)}>
          {locale === 'ar' ? 'نمِقة' : 'Nomiqa'}
        </span>
      ) : null}
    </span>
  );
}
