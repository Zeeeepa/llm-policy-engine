/**
 * Logger utility using Pino
 */
import pino from 'pino';
import { config } from './config';

const logger = pino({
  level: config.observability.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;

export const createChildLogger = (context: Record<string, any>) => {
  return logger.child(context);
};
