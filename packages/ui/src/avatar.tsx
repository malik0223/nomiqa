import { cn } from './cn';

const sizeMap = {
  xs: 'h-7 w-7 text-[0.625rem]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
} as const;

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: keyof typeof sizeMap;
  /** حلقة ذهبية رفيعة — تُستعمل لصاحب البطاقة المعروضة فقط. */
  ring?: boolean;
  className?: string;
}

/**
 * الصورة الشخصية، وبديلها حرفان من الاسم.
 *
 * البديل ليس حالة نادرة: الاستيراد الجماعي للفرق ينشئ عشرات
 * الأعضاء بلا صور، وشبكة من الدوائر الرمادية الفارغة تجعل تمييز
 * الصفّ مستحيلاً. الحرفان يعطيان تمييزاً مجانياً.
 */
export function Avatar({ name, src, size = 'md', ring = false, className }: AvatarProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    // أداة التعريف تُسقَط: «أحمد الكندي» يعطي «أك» لا «أا»، وشبكة
    // كاملة من الأحرف الثانية «ا» لا تميّز صفاً عن آخر.
    .map((part) => {
      const letters = Array.from(part.startsWith('ال') && part.length > 2 ? part.slice(2) : part);
      return letters[0] ?? '';
    })
    .join('');

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'border border-line bg-primary-soft font-display font-semibold text-primary',
        'dark:text-ink-200',
        ring && 'ring-2 ring-accent-line ring-offset-2 ring-offset-surface',
        sizeMap[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
