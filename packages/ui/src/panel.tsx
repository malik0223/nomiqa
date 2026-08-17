import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './icon';

/* ============================================================
   الأسطح
   ------------------------------------------------------------
   سطح واحد فقط في هذا النظام: ورقة بيضاء بخطّ شعري وظلّ خفيف.
   لا توجد «بطاقة داخل بطاقة» — التداخل يُعبَّر عنه بخطّ فاصل
   وتباعد، لا بطبقة ثالثة من الظلال.
   ============================================================ */

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** بلا ظلّ ولا خلفية — للأقسام التي تعيش داخل لوحة أخرى. */
  flush?: boolean;
  /** يزيل الحشو الداخلي: للجداول والقوائم التي تملأ اللوحة حتى الحافة. */
  bare?: boolean;
}

export function Panel({
  as: Tag = 'section',
  flush = false,
  bare = false,
  className,
  ...props
}: PanelProps) {
  return (
    <Tag
      className={cn(
        'rounded-card',
        flush ? 'bg-transparent' : 'border border-line bg-surface shadow-sheet',
        !bare && 'p-5 sm:p-6',
        className,
      )}
      {...props}
    />
  );
}

export interface PanelHeaderProps {
  title: ReactNode;
  /** سطر يشرح ما تعرضه اللوحة أو القاعدة التي تحكمها. */
  description?: ReactNode;
  icon?: IconName;
  /** أفعال تخصّ هذه اللوحة وحدها. */
  actions?: ReactNode;
  className?: string;
}

/**
 * ترويسة لوحة.
 *
 * العنوان دائماً `h2` بحجم صغير: التسلسل الهرمي في هذه الشاشات
 * يحمله الوزن والمسافة لا حجم الخطّ — عناوين كبيرة متتالية داخل
 * صفحة واحدة تُفقد الصفحة مركزها.
 */
export function PanelHeader({ title, description, icon, actions, className }: PanelHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <Icon name={icon} size={18} className="mt-0.5 text-accent" /> : null}
        <div className="min-w-0">
          <h2 className="font-display text-[0.9375rem] font-semibold tracking-tight text-fg">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-prose text-[0.8125rem] leading-6 text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** خطّ فاصل شعري. الافتراضي أفقي. */
export function Divider({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  return (
    <div
      role="presentation"
      className={cn(vertical ? 'w-px self-stretch bg-line' : 'h-px w-full bg-line', className)}
    />
  );
}

/**
 * عنوان فرعي صغير بحروف متباعدة وخطّ ذهبي تحته.
 *
 * الخطّ الذهبي هنا ليس زينة: هو العلامة الوحيدة التي تفصل مجموعة
 * حقول عن التي تليها داخل نموذج طويل بلا إضافة لوحة جديدة.
 */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="font-display text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-accent">
        {children}
      </span>
      <span className="h-px flex-1 bg-accent-line/35" aria-hidden="true" />
    </div>
  );
}
