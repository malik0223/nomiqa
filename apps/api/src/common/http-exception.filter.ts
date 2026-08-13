import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody } from '@nomiqa/contracts';
import type { Request, Response } from 'express';

/**
 * صيغة خطأ موحّدة لكل الـAPI (§5.5).
 *
 * لا تُسرَّب تفاصيل الأخطاء غير المتوقعة إلى العميل — تُسجَّل داخلياً
 * ويُعاد للعميل رمز الطلب فقط ليستشهد به عند طلب الدعم.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      const body: ApiErrorBody = {
        error: {
          code: httpStatusToCode(status),
          message:
            typeof payload === 'string'
              ? payload
              : ((payload as { message?: string }).message ?? exception.message),
          requestId,
        },
      };

      response.status(status).json(body);
      return;
    }

    this.logger.error(
      `خطأ غير متوقع [requestId=${requestId}]`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const body: ApiErrorBody = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'حدث خطأ غير متوقع',
        requestId,
      },
    };

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'ERROR';
  }
}
