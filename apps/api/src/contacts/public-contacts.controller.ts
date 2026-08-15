import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  contactSubmissionSchema,
  slugSchema,
  type ContactSubmissionInput,
} from '@nomiqa/validation';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator.js';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ContactCaptureService } from './contact-capture.service.js';

/**
 * نموذج «شارك بياناتك معي».
 *
 * ثاني مسار عام في المنصة بعد الصفحة نفسها، وأخطرهما: ذاك **يقرأ**
 * وهذا **يكتب**. الحد هنا أضيق بكثير من حد قراءة البطاقة (§7.7 حماية
 * النماذج العامة): ثمانية إرسالات في عشر دقائق من العنوان الواحد تغطي
 * أي استخدام بشري معقول — بما فيه معرض يتشارك فيه الحضور شبكة واحدة —
 * وتقطع الإغراق الآلي قبل أن يملأ جداول جهات اتصال بصفوف وهمية.
 *
 * الطبقة الثانية مصيدة في النموذج نفسه، والثالثة أن كل حقل يُقاس على
 * إعداد البطاقة — راجع ContactCaptureService.
 */
@ApiTags('public')
@Controller({ path: 'public/cards', version: '1' })
export class PublicContactsController {
  constructor(private readonly capture: ContactCaptureService) {}

  @Post(':slug/contact')
  @Public()
  @HttpCode(202)
  @RateLimit({ limit: 8, windowSeconds: 600 })
  @ApiOperation({ summary: 'إرسال بيانات تواصل إلى صاحب البطاقة' })
  async submit(
    @Param('slug', new ZodValidationPipe(slugSchema)) slug: string,
    @Body(new ZodValidationPipe(contactSubmissionSchema)) body: ContactSubmissionInput,
    @Req() request: Request,
  ) {
    return this.capture.submit(slug, body, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
      requestId: request.requestId,
    });
  }
}
