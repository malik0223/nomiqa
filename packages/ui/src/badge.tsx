import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './icon';

export type BadgeTone = 'neutral' | 'ink' | 'gold' | 'success' | 'warning' | 'danger';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted border-line',
  ink: 'bg-primary-soft text-primary border-transparent dark:text-ink-200',
  gold: 'bg-accent-soft text-accent border-accent-line/40',
  success:
    'bg-success-50 text-success-600 border-success-100 dark:bg-success-900/40 dark:text-success-100 dark:border-success-900',
  warning:
    'bg-warning-50 text-warning-600 border-warning-100 dark:bg-warning-900/40 dark:text-warning-100 dark:border-warning-900',
  danger:
    'bg-danger-50 text-danger-600 border-danger-100 dark:bg-danger-900/40 dark:text-danger-100 dark:border-danger-900',
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: IconName;
  /** نقطة لونية بدل الأيقونة — أخفّ في الجداول المزدحمة. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * شارة حالة.
 *
 * اللون وحده لا يكفي لنقل الحالة (§الوصول): كل شارة تحمل نصاً،
 * ولون النصّ نفسه يحقّق تبايناً كافياً على خلفيته في الوضعين.
 */
export function Badge({ tone = 'neutral', icon, dot = false, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

/**
 * قيمة تقنية: كود قصير، slug، مفتاح API، معرّف معاملة.
 *
 * دائماً LTR ومعزولة اتجاهياً حتى لا يقلب محرّك الاتجاه ترتيب
 * محارفها داخل جملة عربية — وهو خلل يظهر تحديداً في أكواد NFC
 * وأرقام الفواتير.
 */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      dir="ltr"
      className={cn(
        'inline-block rounded-xs bg-surface-2 px-1.5 py-0.5 font-mono text-[0.8125rem] text-fg',
        className,
      )}
      style={{ unicodeBidi: 'isolate' }}
    >
      {children}
    </code>
  );
}
