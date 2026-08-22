import type { CardSurface } from '@nomiqa/contracts';

/* ============================================================
   جدول أسطح البطاقات
   ------------------------------------------------------------
   §4.4 يمنع بناء كل قالب كمكوّن مستقل. هذا الملف هو البديل:
   **جدول أنماط** يقرؤه محرك واحد. إضافة قالب تبقى صفاً في قاعدة
   البيانات، وإضافة سطح جديد تبقى مدخلاً هنا لا مكوّناً بمنطق خاص.

   لون الهوية يصل كمتغيّر CSS اسمه `--nq-accent` يضبطه المحرك على
   حاوية البطاقة، فتبقى القيم هنا أصنافاً خالصة بلا أنماط سطرية.

   الوضع الداكن: بعض الأسطح داكنة بطبعها (نيون، رقاقة، فضاء) وبعضها
   فاتح بطبعها (نحت، صحيفة). هذه ليست ثنائية فاتح/داكن بل شخصية
   ثابتة للقالب — إجبارها على الوضعين يفسد كليهما.
   ============================================================ */

export type LinkLayout = 'stack' | 'grid' | 'text';
export type AvatarShape = 'circle' | 'square' | 'portrait';
export type CoverMode = 'band' | 'fill' | 'none';

export interface SurfaceStyle {
  /** أصناف حاوية البطاقة نفسها. */
  article: string;
  /** طبقات زخرفية مطلقة تُرسم خلف المحتوى (خلفيات، شبكات، توهّج). */
  layers: string[];
  /** غلاف الأقسام — يرفعه فوق الطبقات الزخرفية. */
  content: string;
  header: string;
  name: string;
  role: string;
  org: string;
  meta: string;
  avatar: string;
  avatarShape: AvatarShape;
  primary: string;
  linkLayout: LinkLayout;
  linkSection: string;
  link: string;
  linkIcon: string;
  linkLabel: string;
  linkValue: string;
  chevron: string;
  coverMode: CoverMode;
  cover: string;
  logoOnCover: string;
  logoStandalone: string;
  /** حشو قسم الأفعال. فارغ حين يكون المحتوى داخل لوح محشوّ أصلاً. */
  actionsPadding: string;
  /** غلاف الشعار حين لا غلاف صورة. */
  logoWrapper: string;
  /** حشو علوي حين لا غلاف ولا شعار — يمنع التصاق الاسم بالحافة. */
  contentTopPadding: string;
}

/** السطح الأصلي — يعيد إنتاج سلوك المحرك قبل وجود الأسطح حرفياً. */
const flat: SurfaceStyle = {
  article:
    'mx-auto flex w-full max-w-md flex-col gap-7 overflow-hidden rounded-2xl bg-white pb-10 shadow-sheet dark:bg-neutral-900',
  layers: [],
  content: 'flex flex-col gap-7',
  header: 'flex flex-col gap-4 px-6',
  name: 'font-display text-[1.625rem] font-bold leading-tight tracking-tight',
  role: 'text-[0.9375rem] font-medium text-[var(--nq-accent)]',
  org: 'mt-0.5 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400',
  meta: 'flex items-center gap-1.5 text-[0.8125rem] text-neutral-500',
  avatar: 'h-28 w-28 object-cover ring-4 ring-white dark:ring-neutral-900',
  avatarShape: 'circle',
  primary:
    'flex items-center justify-center gap-2 px-5 py-3.5 text-center text-sm font-semibold text-white bg-[var(--nq-accent)]',
  linkLayout: 'stack',
  linkSection: 'flex flex-col gap-2 px-6',
  link: 'group flex items-center gap-3 border border-neutral-200 bg-white/60 px-4 py-3 text-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:bg-neutral-800/60',
  linkIcon:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--nq-accent)_8%,transparent)] text-[var(--nq-accent)]',
  linkLabel: 'block truncate font-medium',
  linkValue: 'block truncate text-xs text-neutral-500',
  chevron:
    'text-neutral-300 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 dark:text-neutral-600',
  coverMode: 'band',
  cover: 'h-36 w-full object-cover',
  logoOnCover:
    'absolute end-4 top-4 h-9 max-w-24 rounded-sm bg-white/90 object-contain p-1.5 shadow-sheet',
  logoStandalone: 'h-8 max-w-32 object-contain',
  actionsPadding: 'px-6',
  logoWrapper: 'px-6 pt-8',
  contentTopPadding: 'pt-9',
};

/** الشفق — تدرّج شبكي متحرك خلف لوح زجاجي. */
const aurora: SurfaceStyle = {
  ...flat,
  article:
    'relative mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#0a0620] pb-6 text-white shadow-sheet',
  layers: ['nq-aurora-sky pointer-events-none absolute inset-0'],
  content:
    'relative z-10 m-4 flex flex-col gap-6 rounded-[18px] border border-white/20 bg-[#0c081e]/50 p-5 backdrop-blur-lg',
  header: 'flex flex-col gap-4',
  name: 'font-display text-2xl font-bold leading-tight tracking-tight text-white',
  role: 'text-[0.9375rem] font-medium text-white/80',
  org: 'mt-0.5 flex items-center gap-1.5 text-sm text-white/65',
  meta: 'flex items-center gap-1.5 text-[0.8125rem] text-white/60',
  avatar: 'h-24 w-24 object-cover ring-2 ring-white/50',
  primary:
    'flex items-center justify-center gap-2 px-5 py-3 text-center text-sm font-semibold text-[#2a0f5e] bg-white/95',
  linkSection: 'flex flex-col gap-2',
  link: 'group flex items-center gap-3 border border-white/20 bg-white/10 px-4 py-3 text-sm text-white transition-colors hover:bg-white/20',
  linkIcon: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white',
  linkValue: 'block truncate text-xs text-white/60',
  chevron: 'text-white/40 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100',
  coverMode: 'none',
  actionsPadding: '',
  logoWrapper: 'mb-2',
  contentTopPadding: '',
};

/** زجاج — الغلاف يملأ البطاقة ولوح مثلّج يطفو فوقه. */
const glass: SurfaceStyle = {
  ...aurora,
  article:
    'relative mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#05050d] pb-4 text-white shadow-sheet',
  layers: ['pointer-events-none absolute inset-0 bg-[#04040e]/30'],
  content:
    'relative z-10 mx-4 mb-2 mt-14 flex flex-col gap-6 rounded-[20px] border border-white/25 bg-white/10 p-5 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl',
  avatar: 'h-20 w-20 object-cover ring-2 ring-white/55',
  coverMode: 'fill',
  cover: 'absolute inset-0 h-full w-full scale-110 object-cover',
  logoOnCover:
    'absolute end-4 top-4 z-20 h-8 max-w-24 rounded-md bg-white object-contain p-1.5 shadow-sheet',
  actionsPadding: '',
  logoWrapper: '',
  contentTopPadding: '',
};

/** نيون — شبكة منظورية وتوهّج بنفسجي. */
const neon: SurfaceStyle = {
  ...flat,
  article:
    'relative mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#05040e] pb-8 text-[#e9e6ff] shadow-sheet',
  layers: [
    'nq-neon-grid pointer-events-none absolute inset-0',
    'nq-neon-bar pointer-events-none absolute inset-x-0 bottom-0 h-0.5',
  ],
  content: 'relative z-10 flex flex-col gap-6 pt-7',
  name: 'nq-neon-glow font-display text-[1.625rem] font-bold leading-tight tracking-tight text-white',
  role: 'text-[0.9375rem] font-medium text-[#c4b5fd]',
  org: 'mt-0.5 flex items-center gap-1.5 text-sm text-[#a5b4fc]/80',
  meta: 'flex items-center gap-1.5 text-[0.8125rem] text-[#a5b4fc]/70',
  avatar: 'h-24 w-24 object-cover ring-1 ring-[#a855f7] shadow-[0_0_18px_rgba(168,85,247,0.6)]',
  primary:
    'nq-neon-cta flex items-center justify-center gap-2 px-5 py-3.5 text-center text-sm font-semibold text-[#05040e]',
  link: 'group flex items-center gap-3 border border-[#8b5cf6]/25 bg-[#8b5cf6]/5 px-4 py-3 text-sm transition-colors hover:bg-[#8b5cf6]/15',
  linkIcon:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#22d3ee]/10 text-[#22d3ee]',
  linkValue: 'block truncate text-xs text-[#22d3ee]',
  chevron: 'text-[#8b5cf6]/50 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100',
  coverMode: 'none',
  actionsPadding: 'px-6',
  logoWrapper: 'px-6 pt-6',
  contentTopPadding: '',
};

/** بنتو — الروابط شبكة بلاطات بدل قائمة. */
const bento: SurfaceStyle = {
  ...flat,
  article:
    'mx-auto flex w-full max-w-md flex-col gap-3 overflow-hidden rounded-2xl bg-[#0e0e18] p-3 pb-4 text-white shadow-sheet',
  layers: [],
  content: 'flex flex-col gap-3',
  header: 'flex flex-col gap-3 rounded-2xl border border-[#262637] bg-[#191926] p-4',
  name: 'font-display text-xl font-bold leading-tight tracking-tight text-white',
  role: 'text-sm font-medium text-[#c4b5fd]',
  org: 'mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-[#8b8ba6]',
  meta: 'flex items-center gap-1.5 text-xs text-[#8b8ba6]',
  avatar: 'h-24 w-24 object-cover',
  avatarShape: 'square',
  primary:
    'flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-center text-sm font-semibold text-white bg-[var(--nq-accent)]',
  linkLayout: 'grid',
  linkSection: 'grid grid-cols-2 gap-2',
  link: 'flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#262637] bg-[#191926] px-3 py-4 text-center text-xs font-medium transition-colors hover:bg-[#1d1d2d]',
  linkIcon:
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--nq-accent)_18%,transparent)] text-[var(--nq-accent)]',
  linkLabel: 'block truncate font-medium',
  linkValue: 'hidden',
  chevron: 'hidden',
  coverMode: 'none',
  logoStandalone: 'h-9 max-w-32 object-contain',
  actionsPadding: '',
  logoWrapper: 'rounded-2xl border border-[#262637] bg-white p-3',
  contentTopPadding: '',
};

/** نحت — ظلال مزدوجة ناعمة، بلا حواف حادة. */
const relief: SurfaceStyle = {
  ...flat,
  article:
    'mx-auto flex w-full max-w-md flex-col gap-7 overflow-hidden rounded-[26px] bg-[#e9e5f2] pb-10 text-[#241d3d] shadow-sheet',
  content: 'flex flex-col gap-6',
  header: 'nq-relief-out mx-5 mt-5 flex flex-col gap-4 rounded-[22px] bg-[#efecf7] p-5',
  name: 'font-display text-2xl font-bold leading-tight tracking-tight text-[#241d3d]',
  role: 'text-[0.9375rem] font-medium text-[#6d5fa8]',
  org: 'mt-0.5 flex items-center gap-1.5 text-sm text-[#6d5fa8]/80',
  meta: 'flex items-center gap-1.5 text-[0.8125rem] text-[#6d5fa8]/70',
  avatar: 'nq-relief-out h-24 w-24 object-cover',
  primary:
    'nq-relief-out flex items-center justify-center gap-2 rounded-[18px] px-5 py-3.5 text-center text-sm font-semibold text-white bg-[var(--nq-accent)]',
  linkSection: 'flex flex-col gap-3 px-6',
  link: 'nq-relief-out group flex items-center gap-3 rounded-[18px] bg-[#efecf7] px-4 py-3.5 text-sm',
  linkIcon:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--nq-accent)_12%,transparent)] text-[var(--nq-accent)]',
  linkValue: 'block truncate text-xs text-[#6d5fa8]/70',
  chevron: 'text-[#6d5fa8]/40 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100',
  coverMode: 'none',
  actionsPadding: 'px-6',
  logoWrapper: 'px-6 pt-6',
  contentTopPadding: '',
};

/** صحيفة — الاسم ضخم، الصورة رمادية، الروابط أسطر لا بطاقات. */
const editorial: SurfaceStyle = {
  ...flat,
  article:
    'mx-auto flex w-full max-w-md flex-col gap-6 overflow-hidden rounded-none bg-[#f7f6f2] pb-9 text-[#0d0d0d] shadow-sheet',
  content: 'flex flex-col gap-6',
  header: 'flex flex-col gap-3 px-6',
  name: 'font-display text-[2.5rem] font-bold leading-[0.98] tracking-[-0.045em] text-[#0d0d0d]',
  role: 'text-sm font-semibold uppercase tracking-[0.14em] text-[var(--nq-accent)]',
  org: 'mt-0.5 flex items-center gap-1.5 text-sm text-[#3a3a3a]',
  meta: 'flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-[#8a8a8a]',
  avatar: 'h-24 w-20 object-cover grayscale contrast-[1.08]',
  avatarShape: 'portrait',
  primary:
    'flex items-center justify-center gap-2 rounded-none px-5 py-3.5 text-center text-sm font-bold text-[#f7f6f2] bg-[#0d0d0d]',
  linkLayout: 'text',
  linkSection: 'flex flex-col px-6',
  link: 'group flex items-baseline justify-between gap-3 border-b border-[#0d0d0d]/15 py-2.5 text-sm',
  linkIcon: 'hidden',
  linkLabel: 'font-medium',
  linkValue: 'font-mono text-xs text-[#3a3a3a]',
  chevron: 'hidden',
  coverMode: 'none',
  logoStandalone: 'h-9 max-w-32 object-contain',
  actionsPadding: 'px-6',
  logoWrapper: 'px-6 pt-7',
  contentTopPadding: '',
};

/** رقاقة — أسود مطفأ وكتابة ذهبية مختومة. */
const foil: SurfaceStyle = {
  ...flat,
  article:
    'relative mx-auto flex w-full max-w-md flex-col gap-6 overflow-hidden rounded-2xl bg-[#0c0c0e] pb-9 text-[#e8e6e0] shadow-sheet',
  layers: [
    'nq-foil-glow pointer-events-none absolute inset-0',
    'pointer-events-none absolute inset-2.5 rounded-[15px] border border-[#e3c07b]/35',
  ],
  content: 'relative z-10 flex flex-col gap-6 pt-8',
  name: 'nq-foil-text font-display text-[1.625rem] font-bold leading-tight tracking-tight',
  role: 'text-[0.9375rem] font-medium text-[#b8b3a6]',
  org: 'mt-0.5 flex items-center gap-1.5 text-sm text-[#8f8a7d]',
  meta: 'flex items-center gap-1.5 text-[0.8125rem] text-[#8f8a7d]',
  avatar: 'h-24 w-24 object-cover ring-1 ring-[#e3c07b]/40',
  primary:
    'nq-foil-cta flex items-center justify-center gap-2 px-5 py-3.5 text-center text-sm font-semibold text-[#0c0c0e]',
  link: 'group flex items-center gap-3 border border-[#e3c07b]/20 bg-[#e3c07b]/5 px-4 py-3 text-sm transition-colors hover:bg-[#e3c07b]/10',
  linkIcon:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e3c07b]/10 text-[#e3c07b]',
  linkValue: 'block truncate text-xs text-[#8f8a7d]',
  chevron: 'text-[#e3c07b]/35 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100',
  coverMode: 'none',
  actionsPadding: 'px-6',
  logoWrapper: 'px-6 pt-7 flex justify-center',
  contentTopPadding: '',
};

/** فضاء — ألواح شفافة مرصوصة بعمق. */
const spatial: SurfaceStyle = {
  ...aurora,
  article:
    'relative mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#0d1020] pb-5 text-[#eef0ff] shadow-sheet',
  layers: ['nq-spatial-halo pointer-events-none absolute inset-0'],
  content: 'relative z-10 flex flex-col gap-3 p-4',
  header:
    'flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/5 p-4 shadow-[0_22px_44px_-24px_rgba(0,0,0,0.95)] backdrop-blur-md',
  linkSection:
    'flex flex-col gap-2 rounded-2xl border border-white/15 bg-white/5 p-3 shadow-[0_22px_44px_-24px_rgba(0,0,0,0.95)] backdrop-blur-md',
  link: 'group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition-colors hover:bg-white/10',
  primary:
    'flex items-center justify-center gap-2 px-5 py-3.5 text-center text-sm font-semibold text-[#1a1f45] bg-white/95',
  avatar: 'h-20 w-20 object-cover ring-1 ring-white/40',
  coverMode: 'none',
  actionsPadding: '',
  logoWrapper: '',
  contentTopPadding: '',
};

const SURFACES: Record<CardSurface, SurfaceStyle> = {
  flat,
  aurora,
  glass,
  neon,
  bento,
  relief,
  editorial,
  foil,
  spatial,
};

/**
 * يسقط إلى `flat` عند سطح غير معروف: لقطة منشورة قديمة أو صفّ تالف
 * يجب أن تُعرض بالسلوك الأصلي لا أن تُسقط الصفحة العامة.
 */
export function surfaceStyle(surface: string | undefined): SurfaceStyle {
  return SURFACES[(surface ?? 'flat') as CardSurface] ?? flat;
}

/**
 * ألوان مصغّر المعاينة في منتقي القوالب.
 *
 * منفصلة عن `SurfaceStyle` عمداً: تلك أصناف عرض للبطاقة الحقيقية،
 * وهذه قيم خام يحتاجها رسمٌ تخطيطي بحجم 64px داخل واجهة نمِقة. خلطهما
 * كان يعني استيراد أنماط البطاقة في المحرر لمجرد رسم مربّع ملوّن.
 */
export interface SurfaceSwatch {
  bg: string;
  ink: string;
}

const SWATCHES: Record<CardSurface, SurfaceSwatch> = {
  flat: { bg: '#ffffff', ink: '#171717' },
  aurora: { bg: '#0a0620', ink: '#ffffff' },
  glass: { bg: '#05050d', ink: '#ffffff' },
  neon: { bg: '#05040e', ink: '#e9e6ff' },
  bento: { bg: '#0e0e18', ink: '#ffffff' },
  relief: { bg: '#e9e5f2', ink: '#241d3d' },
  editorial: { bg: '#f7f6f2', ink: '#0d0d0d' },
  foil: { bg: '#0c0c0e', ink: '#e3c07b' },
  spatial: { bg: '#0d1020', ink: '#eef0ff' },
};

export function surfaceSwatch(surface: string | undefined): SurfaceSwatch {
  return SWATCHES[(surface ?? 'flat') as CardSurface] ?? SWATCHES.flat;
}
