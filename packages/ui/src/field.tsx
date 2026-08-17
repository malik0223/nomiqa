import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

/* ============================================================
   الحقول
   ------------------------------------------------------------
   قاعدة واحدة تحكم كل حقل في التطبيق: ارتفاع 40px، خطّ شعري،
   وسطح `surface-2` لا أبيض. الحقل الأبيض على لوحة بيضاء يحتاج
   حدّاً ثقيلاً ليُرى؛ السطح المائل يجعل الخطّ الشعري كافياً.
   ============================================================ */

const controlBase = [
  'w-full rounded-md border border-line bg-surface-2 text-fg',
  'placeholder:text-faint',
  'transition-colors duration-150',
  'hover:border-line-strong',
  'focus:border-accent-line focus:bg-surface',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'aria-[invalid=true]:border-danger-500',
].join(' ');

export interface FieldProps {
  /** يجب أن يطابق `id` عنصر الإدخال. */
  htmlFor?: string;
  label: ReactNode;
  /** شرح قصير يظهر تحت التسمية — لا يكرّرها. */
  hint?: ReactNode;
  /** رسالة خطأ. وجودها يعني أن الحقل مرفوض. */
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * غلاف الحقل: تسمية + إدخال + شرح أو خطأ.
 *
 * الشرح يظهر **قبل** الإدخال والخطأ **بعده**: الأول شرط يُقرأ
 * قبل الكتابة، والثاني نتيجة تُقرأ بعدها.
 */
export function Field({
  htmlFor,
  label,
  hint,
  error,
  required = false,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[0.8125rem] font-medium text-fg">
        {label}
        {required ? (
          <span className="ms-1 text-accent" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {hint ? <p className="text-xs leading-5 text-muted">{hint}</p> : null}

      {children}

      {error ? (
        <p role="alert" className="text-xs leading-5 text-danger-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, 'h-10 px-3 text-sm', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(controlBase, 'min-h-24 px-3 py-2 text-sm leading-6', className)} {...props} />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlBase, 'h-10 px-3 text-sm', className)} {...props}>
      {children}
    </select>
  );
}

/**
 * مربّع اختيار مع نصّه.
 *
 * مساحة النقر تشمل النصّ كاملاً لا المربّع وحده — الفرق ملموس على
 * شاشات الجوال حيث تُملأ نماذج الموافقة فعلياً.
 */
export function Checkbox({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface p-3 transition-colors',
        'hover:border-line-strong has-checked:border-accent-line/60 has-checked:bg-accent-soft/40',
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded-xs border-line-strong accent-primary"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-[0.8125rem] font-medium text-fg">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-5 text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/** صفّ حقول متجاور يهبط إلى عمود واحد على الجوال. */
export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
