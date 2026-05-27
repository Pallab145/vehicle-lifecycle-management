import pino from 'pino';
import { env } from '@/config/env';
import type { Request, Response, NextFunction } from 'express';

const isProduction = env.NODE_ENV === 'production';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isProduction
    ? undefined // In production, log fast JSON
    : {
      target: 'pino-pretty', // In development, log pretty text
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    },
});

export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/health')) { next(); return; }

  const start = Date.now();
  res.on('finish', () => {
    const status = res.statusCode;
    const duration = Date.now() - start;
    const log = status >= 500 ? logger.error.bind(logger)
      : status >= 400 ? logger.warn.bind(logger)
        : logger.info.bind(logger);

    const sanitizedUrl = req.url.split('?')[0];
    log({
      method: req.method,
      url: sanitizedUrl,
      status,
      duration,
      ip: req.context?.realIP ?? req.ip,
      requestId: req.context?.requestId,
      userId: req.caller?.userId,
      identity: req.caller?.email,
      orgId: req.caller?.memberId,
      userAgent: req.headers['user-agent'],
    }, `${req.method} ${sanitizedUrl} ${status} ${duration}ms ident=${req.caller?.email || 'anonymous'}`);
  });

  next();
}
