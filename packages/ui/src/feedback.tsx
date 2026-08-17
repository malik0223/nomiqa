import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './icon';

/* ============================================================
   التنبيهات والحالات الفارغة
   ============================================================ */

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const alertTone: Record<AlertTone, { wrap: string; icon: IconName; mark: string }> = {
  info: {
    wrap: 'border-line bg-surface-2 text-fg',
    icon: 'info',
    mark: 'text-muted',
  },
  success: {
    wrap: 'border-success-100 bg-success-50 text-success-900 dark:border-success-900 dark:bg-success-900/30 dark:text-success-100',
    icon: 'check',
    mark: 'text-success-500',
  },
  warning: {
    wrap: 'border-warning-100 bg-warning-50 text-warning-900 dark:border-warning-900 dark:bg-warning-900/30 dark:text-warning-100',
    icon: 'alert',
    mark: 'text-warning-500',
  },
  danger: {
    wrap: 'border-danger-100 bg-danger-50 text-danger-900 dark:border-danger-900 dark:bg-danger-900/30 dark:text-danger-100',
    icon: 'alert',
    mark: 'text-danger-500',
  },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** فعل يصلح ما يشرحه التنبيه. رسالة خطأ بلا مخرج ليست رسالة. */
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const config = alertTone[tone];

  return (
    <div
      // الخطأ والتحذير يقاطعان قارئ الشاشة؛ النجاح والمعلومة تُعلَن
      // بلا مقاطعة. الفرق مقصود: الأول يمنع المتابعة والثاني لا.
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-md border px-4 py-3 text-sm', config.wrap, className)}
    >
      <Icon name={config.icon} size={17} className={cn('mt-0.5', config.mark)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? (
          <div className={cn('leading-6', title && 'mt-1 text-[0.8125rem] opacity-90')}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  /** ماذا يوضع هنا ولماذا هو فارغ الآن. لا اعتذار ولا مزاح. */
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * الحالة الفارغة.
 *
 * دعوة إلى فعل لا إعلان عن نقص: العنوان يقول ما ينقص، والوصف
 * يقول كيف يُملأ، والزرّ ينفّذه.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-dashed border-line px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-accent-line/40 bg-accent-soft/50 text-accent">
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      <p className="font-display text-sm font-semibold text-fg">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-6 text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** هيكل تحميل. يطابق مقاس المحتوى النهائي حتى لا تقفز الصفحة. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3', className)} aria-hidden="true" />;
}
