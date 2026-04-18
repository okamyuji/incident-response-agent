import type { Response } from 'express';
import { logger } from '@/logger.js';

export function triggerHttpError(res: Response): void {
  const statusCode = 500 + Math.floor(Math.random() * 4);
  logger.error({ chaos_type: 'http_5xx', status_code: statusCode }, 'Chaos: returning HTTP 5xx');
  res.status(statusCode).json({
    error: 'chaos_http_5xx',
    statusCode,
    message: 'Intentional failure for incident detection validation',
  });
}
