import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * المؤسسة المعلَّقة تقرأ ولا تكتب (§9.5).
 *
 * التعليق عقوبة على مخالفة، لا حذف: بيانات المؤسسة تبقى مقروءة
 * ومصدَّرة، ويتوقف كل ما يُنتج أثراً جديداً.
 *
 * ثلاثة استثناءات مقصودة تبقى مفتوحة للكتابة:
 *
 *   1. **الفوترة** — أشيع سبب للتعليق عدم السداد. إغلاق مسار الدفع
 *      على من نطالبه بالدفع حلقة مغلقة لا مخرج منها.
 *   2. **الدعم** — الاعتراض على التعليق يجري عبر تذكرة، وقفلها يترك
 *      العميل بلا وسيلة اتصال داخل المنتج.
 *   3. **الخصوصية** — حق الحذف والتصحيح لا يعلَّق بقرار تجاري.
 *
 * يعمل بعد حارس الصلاحيات: من لا يملك الصلاحية أصلاً يُرفض قبل أن
 * يصل إلى هنا، فلا تكشف رسالة التعليق شيئاً لغريب.
 */
@Injectable()
export class SuspensionGuard implements CanActivate {
  /** بادئات المسارات التي تبقى قابلة للكتابة رغم التعليق. */
  private static readonly WRITABLE_WHILE_SUSPENDED = ['/billing', '/support', '/privacy'];

  private static readonly READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.tenant?.suspended) {
      return true;
    }

    if (SuspensionGuard.READ_METHODS.has(request.method)) {
      return true;
    }

    // `route.path` غير متاح قبل التوجيه في كل الحالات، فنقيس على
    // المسار الخام بعد تجريد بادئة الإصدار.
    const path = request.path.replace(/^\/api\/v\d+/, '');
    if (SuspensionGuard.WRITABLE_WHILE_SUSPENDED.some((prefix) => path.startsWith(prefix))) {
      return true;
    }

    throw new ForbiddenException(
      'حساب المؤسسة معلَّق. راجع فريق الدعم أو سوِّ المستحقات لاستئناف الخدمة.',
    );
  }
}
