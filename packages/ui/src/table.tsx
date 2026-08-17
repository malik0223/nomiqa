import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn';

/* ============================================================
   الجداول
   ------------------------------------------------------------
   بلا خطوط رأسية وبلا تظليل متناوب للصفوف. الفاصل الوحيد خطّ
   شعري أفقي: العين تتبع الصفّ بالمحاذاة والمسافة، والشبكة
   الكاملة تضيف ضجيجاً بصرياً يساوي عدد الخلايا.

   الالتفاف في `overflow-x-auto` إلزامي — جدول الأعضاء وحده يحمل
   ستة أعمدة ولا يتّسع لشاشة جوال.
   ============================================================ */

export function Table({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableElement> & { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <div className="min-w-full px-5 sm:px-6">
        <table className={cn('w-full border-collapse text-start text-sm', className)} {...props}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export function TH({ children, className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap py-2.5 pe-4 text-start text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-faint',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { children: ReactNode }) {
  return (
    <tr className={cn('transition-colors hover:bg-surface-2/70', className)} {...props}>
      {children}
    </tr>
  );
}

export function TD({ children, className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('py-3 pe-4 align-middle text-fg', className)} {...props}>
      {children}
    </td>
  );
}

/**
 * خليّة رقمية.
 *
 * `nq-num` تفرض أرقاماً جدولية واتجاهاً لاتينياً: بدونها تتحرك
 * أعمدة الأرقام أفقياً بين صفّ وآخر وتصبح المقارنة البصرية —
 * وهي كل الغرض من العمود — مستحيلة.
 */
export function TDNum({ children, className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('nq-num py-3 pe-4 text-start align-middle text-fg', className)} {...props}>
      {children}
    </td>
  );
}
