// ハマりポイント: ESM + NodeNext モジュール解決下では `import pino from 'pino'` の
// default import が型エラー（"This expression is not callable"）になります。
// 必ず名前付き import で `{ pino, stdTimeFunctions }` を取得してください。
// 同じ問題が pino-http にもあり、そちらも `import { pinoHttp }` とします。
import { pino, stdTimeFunctions } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: stdTimeFunctions.isoTime,
});
