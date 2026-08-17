import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './icon';

/* ============================================================
   عناصر تخطيط الصفحة
   ============================================================ */

export interface PageHeaderProps {
  /** المجموعة التي تنتمي إليها الشاشة. تُطبع بالذهب وتعمل بديلاً
      عن فتات الخبز في مسار عمقه مستويان لا أكثر. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** جملة واحدة: ما الذي تفعله هذه الشاشة. تُقرأ مرة ثم تُتجاهل،
      فلا تحمّلها تفاصيل تحتاج قراءة متكرّرة. */
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-accent">
            <span className="h-px w-5 bg-accent-line" aria-hidden="true" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** حاوية المحتوى. عرض واحد عبر التطبيق كله لتبقى الأعمدة متّسقة. */
export function PageBody({
  children,
  className,
  width = 'wide',
}: {
  children: ReactNode;
  className?: string;
  width?: 'wide' | 'narrow';
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-5 py-8 sm:px-8 sm:py-10',
        width === 'narrow' ? 'max-w-3xl' : 'max-w-6xl',
        className,
      )}
    >
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}

/* ============================================================
   المقاييس
   ============================================================ */

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** سياق يجعل الرقم قابلاً للحكم عليه: وحدة، أو حصّة، أو مقارنة. */
  meta?: ReactNode;
  icon?: IconName;
  /** يبرز مقياساً واحداً من الشبكة — يُستعمل لمرّة واحدة فقط. */
  featured?: boolean;
  className?: string;
}

/**
 * بطاقة مقياس.
 *
 * الرقم أولاً بحجم كبير والتسمية تحته: العين تقفز بين الأرقام
 * أثناء المسح السريع، ووضع التسمية فوقه يجبرها على قراءة سطرين
 * لكل خانة في شبكة من ستّ خانات.
 */
export function Stat({ label, value, meta, icon, featured = false, className }: StatProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card border p-4',
        featured
          ? 'border-accent-line/45 bg-accent-soft/40'
          : 'border-line bg-surface shadow-sheet',
        className,
      )}
    >
      {icon ? (
        <Icon
          name={icon}
          size={16}
          className={cn('mb-2', featured ? 'text-accent' : 'text-faint')}
        />
      ) : null}
      <p className="nq-num font-display text-2xl font-bold leading-none tracking-tight text-fg">
        {value}
      </p>
      <p className="mt-2 text-xs font-medium text-muted">{label}</p>
      {meta ? <p className="mt-0.5 text-[0.6875rem] text-faint">{meta}</p> : null}
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6', className)}>
      {children}
    </div>
  );
}

/* ============================================================
   قائمة الوصف: مفتاح/قيمة
   ============================================================ */

export function DescriptionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cn('divide-y divide-line', className)}>{children}</dl>;
}

export function DescriptionItem({
  term,
  children,
  className,
}: {
  term: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5', className)}>
      <dt className="text-[0.8125rem] text-muted">{term}</dt>
      <dd className="min-w-0 text-[0.8125rem] font-medium text-fg">{children}</dd>
    </div>
  );
}

/* ============================================================
   التبويبات القطعية
   ============================================================ */

export interface SegmentOption {
  value: string;
  label: ReactNode;
  href: string;
}

/**
 * مبدّل نطاق أو عرض.
 *
 * روابط لا أزرار: النطاق المختار جزء من عنوان الصفحة (`?range=30d`)،
 * فيمكن مشاركته والرجوع إليه بزرّ المتصفح — وهذا هو السلوك المتوقّع
 * من فلتر تقرير.
 */
export function Segmented({
  options,
  active,
  className,
  ariaLabel,
}: {
  options: SegmentOption[];
  active: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-md border border-line bg-surface-2 p-0.5', className)}
    >
      {options.map((option) => {
        const isActive = option.value === active;
        return (
          <a
            key={option.value}
            href={option.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-sm px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
              isActive
                ? 'bg-surface text-fg shadow-sheet'
                : 'text-muted hover:text-fg',
            )}
          >
            {option.label}
          </a>
        );
      })}
    </nav>
  );
}
