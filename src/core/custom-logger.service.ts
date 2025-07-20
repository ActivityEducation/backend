import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config'; // For accessing environment variables

// Define custom log levels and their hierarchy
export type LogLevel = 'debug' | 'log' | 'warn' | 'error' | 'verbose';

@Injectable({ scope: Scope.TRANSIENT }) // Use TRANSIENT scope to allow setting context per instance (e.g., per service/controller)
export class CustomLogger implements LoggerService {
  private context?: string; // Optional context for the log messages (e.g., 'AppService', 'AuthController')
  private currentLogLevel: LogLevel; // The configured minimum log level
  private readonly logLevels: { [key in LogLevel]: number } = {
    'debug': 0,
    'log': 1,
    'warn': 2,
    'error': 3,
    'verbose': -1, // Verbose is typically below debug for more granular output
  };

  constructor(private configService: ConfigService) {
    // Get the desired log level from environment variables, default to 'log'
    const logLevelString = this.configService.get<string>('LOG_LEVEL', 'log').toLowerCase();
    // Validate the log level string and set the current log level
    this.currentLogLevel = (logLevelString in this.logLevels) ? logLevelString as LogLevel : 'log';
    console.log(`CustomLogger initialized. Current log level set to: ${this.currentLogLevel.toUpperCase()}.`);
  }

  /**
   * Sets the context for the logger instance.
   * This is useful for identifying the source of log messages (e.g., which service or controller).
   * @param context The string context (e.g., 'UserService', 'AuthController').
   */
  setContext(context: string) {
    this.context = context;
  }

  /**
   * Determines if a message should be logged based on its level and the configured minimum log level.
   * @param level The level of the message to be logged.
   * @returns True if the message should be logged, false otherwise.
   */
  private shouldLog(level: LogLevel): boolean {
    return this.logLevels[level] >= this.logLevels[this.currentLogLevel];
  }

  // Implement LoggerService methods:

  log(message: any, context?: string, ...optionalParams: any[]) {
    if (this.shouldLog('log')) {
      this.printMessage('log', message, context || this.context, ...optionalParams);
    }
  }

  error(message: any, trace?: string, context?: string, ...optionalParams: any[]) {
    if (this.shouldLog('error')) {
      this.printMessage('error', message, context || this.context, ...optionalParams);
      if (trace) {
        console.error(`Stack Trace: ${trace}`); // Print stack trace separately for errors
      }
    }
  }

  warn(message: any, context?: string, ...optionalParams: any[]) {
    if (this.shouldLog('warn')) {
      this.printMessage('warn', message, context || this.context, ...optionalParams);
    }
  }

  debug(message: any, context?: string, ...optionalParams: any[]) {
    if (this.shouldLog('debug')) {
      this.printMessage('debug', message, context || this.context, ...optionalParams);
    }
  }

  verbose(message: any, context?: string, ...optionalParams: any[]) {
    if (this.shouldLog('verbose')) {
      this.printMessage('verbose', message, context || this.context, ...optionalParams);
    }
  }

  /**
   * Formats and prints the log message to the console.
   * @param level The log level.
   * @param message The message to log.
   * @param context The context of the log.
   * @param optionalParams Additional parameters to pass to console.log/error/warn/debug.
   */
  private printMessage(level: LogLevel, message: any, context: string | undefined, ...optionalParams: any[]) {
    const timestamp = new Date().toISOString();
    // Format the log output for consistency and readability
    const logOutput = `[Nest] ${process.pid} - ${timestamp} [${level.toUpperCase()}] [${context || 'Application'}] ${message}`;
    
    switch (level) {
      case 'error':
        console.error(logOutput, ...optionalParams);
        break;
      case 'warn':
        console.warn(logOutput, ...optionalParams);
        break;
      case 'debug':
        console.debug(logOutput, ...optionalParams);
        break;
      case 'verbose':
        console.log(logOutput, ...optionalParams); // Verbose logs often go to stdout
        break;
      default: // 'log' level
        console.log(logOutput, ...optionalParams);
        break;
    }
  }
}