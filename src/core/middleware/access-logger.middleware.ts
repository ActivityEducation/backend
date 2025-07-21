import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '../../shared/services/logger.service';

@Injectable()
export class AccessLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  public use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { method, originalUrl, ip } = req;
      const userAgent = req.get('user-agent') || '';
      const contentLength = res.get('content-length');
      const statusCode = res.statusCode;

      this.logger.access(
        `${method} ${originalUrl} ${statusCode} ${duration}ms - ${userAgent} ${ip} - ${contentLength || 0}bytes`,
        'Nest',
        method,
        originalUrl,
        statusCode,
        duration,
        userAgent,
        ip,
        contentLength,
      );
    });

    next();
  }
}
