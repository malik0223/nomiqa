import { Injectable, NestMiddleware } from '@nestjs/common';
import { REQUEST_ID_HEADER, generateRequestId } from '@nomiqa/observability';
import type { NextFunction, Request, Response } from 'express';

/**
 * يضمن وجود Correlation ID لكل طلب ويعيده في الاستجابة،
 * لربط سجلات Web وAPI وWorker لعملية واحدة.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming && incoming.length <= 64 ? incoming : generateRequestId();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
