import { useTranslations } from 'next-intl';
import type { CardStatus } from '@nomiqa/contracts';

/**
 * حالة البطاقة كما يراها صاحبها.
 *
 * «منشورة مع تعديلات غير منشورة» حالة رابعة لا ثالثة: البطاقة مرئية
 * للزوار لكن ما يرونه ليس ما يراه صاحبها في المحرر. إخفاء هذا الفرق
 * يجعل المستخدم يظن أن تعديله وصل الناس وهو لم يصل.
 */
export function CardStatusBadge({
  status,
  hasUnpublishedChanges,
}: {
  status: CardStatus;
  hasUnpublishedChanges: boolean;
}) {
  const t = useTranslations();

  if (status === 'published' && hasUnpublishedChanges) {
    return (
      <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
        {t('cards.status.pendingChanges')}
      </Badge>
    );
  }

  switch (status) {
    case 'published':
      return (
        <Badge className="bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200">
          {t('cards.status.published')}
        </Badge>
      );

    case 'unpublished':
      return (
        <Badge className="bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          {t('cards.status.unpublished')}
        </Badge>
      );

    case 'draft':
    default:
      return (
        <Badge className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {t('cards.status.draft')}
        </Badge>
      );
  }
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}
