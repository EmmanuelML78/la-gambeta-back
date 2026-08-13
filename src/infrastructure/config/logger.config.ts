/**
 * Winston Logger Configuration
 * Professional logging setup with different transports and formats
 */

import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, errors, json, printf, colorize } = format;

// Custom format for console output
const consoleFormat = printf((info) => {
  const { level, message, timestamp, ...meta } = info;
  const metaString = Object.keys(meta).length
    ? JSON.stringify(meta, null, 2)
    : '';
  return `${String(timestamp)} [${String(level)}]: ${String(message)} ${metaString}`;
});

// Custom format for file output
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  json(),
);

// Create the logger
export const createAppLogger = (environment: string) => {
  const logger = createLogger({
    level: environment === 'production' ? 'warn' : 'debug',
    defaultMeta: {
      service: 'el-predio-v2',
      environment,
    },
    transports: [
      // Console transport
      new transports.Console({
        format: combine(
          colorize(),
          timestamp({ format: 'HH:mm:ss' }),
          consoleFormat,
        ),
        silent: environment === 'test',
      }),

      // Error log file
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        format: fileFormat,
        maxSize: '20m',
        maxFiles: '14d',
        auditFile: 'logs/.audit/error-audit.json',
      }),

      // Combined log file
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        format: fileFormat,
        maxSize: '20m',
        maxFiles: '14d',
        auditFile: 'logs/.audit/combined-audit.json',
      }),

      // Application specific logs
      new DailyRotateFile({
        filename: 'logs/application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'info',
        format: fileFormat,
        maxSize: '20m',
        maxFiles: '30d',
        auditFile: 'logs/.audit/application-audit.json',
      }),
    ],
  });

  // Add performance logs in production
  if (environment === 'production') {
    logger.add(
      new DailyRotateFile({
        filename: 'logs/performance-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'info',
        format: fileFormat,
        maxSize: '20m',
        maxFiles: '7d',
        auditFile: 'logs/.audit/performance-audit.json',
      }),
    );
  }

  return logger;
};

// Logger levels explanation:
// error: 0 - Error messages
// warn: 1 - Warning messages
// info: 2 - Informational messages
// http: 3 - HTTP requests
// verbose: 4 - Verbose messages
// debug: 5 - Debug messages
// silly: 6 - Silly messages
