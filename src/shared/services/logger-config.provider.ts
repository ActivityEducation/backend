import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';
import 'winston-daily-rotate-file';

const Colors = {
    info: "\x1b[36m",
    error: "\x1b[31m",
    warn: "\x1b[33m",
    FgGreen: "\x1b[32m",
    verbose: "\x1b[43m",
    FgBlack: "\x1b[30m",
    FgRed: "\x1b[31m",
    FgYellow: "\x1b[33m",
    FgBlue: "\x1b[34m",
    FgMagenta: "\x1b[35m",
    FgCyan: "\x1b[36m",
    FgWhite: "\x1b[37m",
};

function padLeftForRightAlign(value, totalWidth) {
  const strValue = String(value);
  if (strValue.length >= totalWidth) {
    return strValue;
  }
  const padding = ' '.repeat(totalWidth - strValue.length);
  return padding + strValue;
}

const customColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  access: 'gray',
};

export function provideLoggerOptions() {
  return {
    provide: 'LoggerOptions',
    useValue: {
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        access: 6,
      },
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: format.combine(
        format.timestamp({ format: 'MM/DD/YYYY, h:mm:ss A' }),
        format.printf(JSON.stringify),
      ),
      transports: [
        new transports.Console({
          format: format.combine(
            format.printf(({ level, message, timestamp, context, msDiff }) => {
              const _logType_ = padLeftForRightAlign((level ?? 'log').toUpperCase(), 7);
              const _timestamp_ = `${Colors.FgWhite}${timestamp}${Colors.FgGreen}`;
              const _process_ = `${Colors.FgGreen}[Nest] ${process.pid}`;
              const _content_ = `${Colors.FgYellow}[${context || 'Application'}]${Colors.FgGreen}`;
              const _diff_ = `${Colors.FgYellow}${msDiff}`;

              return `${_process_}  - ${_timestamp_} ${_logType_} ${_content_} ${message} ${_diff_}`;
            }),
            format.colorize({ colors: customColors }),
          ),
        }),
        new transports.DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          level: 'info', // Only info and above for file logs in production
        }),
        new transports.DailyRotateFile({
          filename: 'logs/access-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          level: 'access', // Only info and above for file logs in production
        }),
        new transports.DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          level: 'error', // Only error logs in a separate file
        }),
      ],
    },
  };
}
