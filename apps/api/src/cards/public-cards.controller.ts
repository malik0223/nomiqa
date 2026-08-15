import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { slugSchema } from '@nomiqa/validation';
import { Public } from '../auth/public.decorator.js';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CardsService } from './cards.service.js';

/**
 * البطاقة العامة.
 *
 * المسار الوحيد في المنصة الذي يُقرأ بلا مصادقة وبلا سياق مؤسسة —
 * وهو شرط غير قابل للتفاوض في خارطة الطريق §7.5: **تُفتح البطاقة دون
 * تسجيل ودون تطبيق**.
 *
 * ولأنه كذلك، له قيدان صريحان:
 *  1. حد معدل أضيق: مسار مجهول مفتوح هو ناقل الكشط والإغراق الأول.
 *  2. لا يُرجع إلا اللقطة المنشورة — لا استعلام على جداول المؤسسة.
 */
@ApiTags('public')
@Controller({ path: 'public/cards', version: '1' })
export class PublicCardsController {
  constructor(private readonly cards: CardsService) {}

  @Get(':slug')
  @Public()
  @RateLimit({ limit: 120, windowSeconds: 60 })
  // الويب يخزّن الصفحة، وهذه الترويسة تسمح للطبقات الوسيطة بمشاركة
  // النسخة نفسها: المحتوى منشور للعامة ولا يختلف بين زائر وآخر.
  @Header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  @ApiOperation({ summary: 'اللقطة المنشورة لبطاقة عامة' })
  async bySlug(@Param('slug', new ZodValidationPipe(slugSchema)) slug: string) {
    return this.cards.publicBySlug(slug);
  }
}
