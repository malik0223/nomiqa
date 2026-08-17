import { Badge } from '@nomiqa/ui';
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
      <Badge tone="warning" dot>
        {t('cards.status.pendingChanges')}
      </Badge>
    );
  }

  switch (status) {
    case 'published':
      return (
        <Badge tone="success" dot>
          {t('cards.status.published')}
        </Badge>
      );

    case 'unpublished':
      return (
        <Badge tone="neutral" dot>
          {t('cards.status.unpublished')}
        </Badge>
      );

    case 'draft':
    default:
      return (
        <Badge tone="neutral" dot>
          {t('cards.status.draft')}
        </Badge>
      );
  }
}
