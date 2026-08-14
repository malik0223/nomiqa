import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * تحقق من المدخلات باستخدام Zod.
 *
 * نستخدم Zod لا class-validator عمداً (وثيقة المعمارية §4.6): المخططات
 * تُكتب مرة واحدة في `@nomiqa/validation` وتُستخدم في المتصفح والـAPI معاً،
 * فلا تتباعد قواعد التحقق بين الطرفين.
 *
 * الاستخدام:
 *   @Post()
 *   create(@Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput)
 *
 * ملاحظة حماية: استخدم مخططات `.strict()` لمنع Mass Assignment —
 * Zod يتجاهل الحقول الزائدة صامتاً في الوضع الافتراضي.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'البيانات المرسلة غير صالحة',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
