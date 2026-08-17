import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

const base = [
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap',
  'transition-[background-color,border-color,color,box-shadow] duration-150',
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45',
].join(' ');

const variantClasses: Record<Variant, string> = {
  // الفعل الأساسي: حبر ممتلئ. واحد فقط في الشاشة — لو تنافس زرّان
  // على هذا المظهر ضاع معنى «الأساسي».
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-sheet',

  // الفعل الثانوي: سطح بخطّ شعري. هو الشكل الغالب في التطبيق.
  secondary: 'bg-surface text-fg border border-line hover:border-line-strong hover:bg-surface-2',

  // بلا حدّ: للأفعال داخل الجداول والقوائم حيث الحدّ يشوّش الصفّ.
  ghost: 'bg-transparent text-muted hover:bg-surface-2 hover:text-fg',

  // الهدم: أحمر شمع الختم، وبحدّ لا بامتلاء — الزرّ الممتلئ الأحمر
  // يجذب النقر قبل القراءة.
  danger: 'bg-transparent text-danger-500 border border-danger-100 hover:bg-danger-50 dark:border-danger-900 dark:hover:bg-danger-900/40',

  // نصّي بحت: يُستعمل حيث الفعل ثانوي جداً («إلغاء»، «تخطّي»).
  quiet: 'bg-transparent text-muted hover:text-fg underline-offset-4 hover:underline',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-[0.8125rem]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[0.9375rem]',
};

const iconOnlySize: Record<Size, string> = {
  sm: 'h-8 w-8 px-0',
  md: 'h-10 w-10 px-0',
  lg: 'h-12 w-12 px-0',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  /** أيقونة قبل النصّ (في اتجاه القراءة). */
  icon?: IconName;
  /** أيقونة بعد النصّ. */
  iconEnd?: IconName;
  /** يملأ عرض الحاوية — للنماذج على الجوال. */
  block?: boolean;
  children?: ReactNode;
  className?: string;
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    CommonProps {}

function classesFor({
  variant = 'secondary',
  size = 'md',
  block,
  hasLabel,
  className,
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  hasLabel: boolean;
  className?: string;
}) {
  return cn(
    base,
    variantClasses[variant],
    hasLabel ? sizeClasses[size] : iconOnlySize[size],
    block && 'w-full',
    className,
  );
}

/**
 * الزرّ الأساسي.
 *
 * كل التباعد بخصائص منطقية، فينعكس التخطيط في RTL دون أنماط
 * منفصلة. حلقة التركيز ذهبية ومعرَّفة مرة واحدة في الطبقة العامة،
 * فلا تُكرَّر هنا ولا يمكن لشاشة أن تنساها.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  block,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  const hasLabel = children !== undefined && children !== null && children !== false;

  return (
    <button
      type={type}
      className={classesFor({ variant, size, block, hasLabel, className })}
      {...props}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={size === 'sm' ? 15 : 17} /> : null}
    </button>
  );
}

export interface LinkButtonProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'>,
    CommonProps {}

/**
 * نفس مظهر الزرّ لعنصر `<a>`.
 *
 * موجود لأن نصف أفعال هذا التطبيق تنقّل لا تنفيذ (فتح المحرر،
 * عرض الفاتورة، تنزيل vCard). تنفيذها بزرّ يكسر فتح الرابط في
 * تبويب جديد وينزع معناها من قارئ الشاشة.
 */
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  block,
  className,
  children,
  ...props
}: LinkButtonProps) {
  const hasLabel = children !== undefined && children !== null && children !== false;

  return (
    <a className={classesFor({ variant, size, block, hasLabel, className })} {...props}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={size === 'sm' ? 15 : 17} /> : null}
    </a>
  );
}

/** أصناف الزرّ للاستعمال مع `<Link>` القادم من next-intl. */
export function buttonClasses(options: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
}) {
  return classesFor({ ...options, hasLabel: true });
}
