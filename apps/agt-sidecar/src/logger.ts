import { pino, stdTimeFunctions } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: stdTimeFunctions.isoTime,
});
