import { type Logger, pino } from 'pino';

export type { Logger };

export function createLogger(level: string, pretty: boolean): Logger {
  if (pretty) {
    return pino({
      level,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    });
  }
  return pino({ level });
}

export function silentLogger(): Logger {
  return pino({ level: 'silent' });
}
