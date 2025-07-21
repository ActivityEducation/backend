import { Injectable, Scope, ConsoleLogger, Inject } from '@nestjs/common';
import { createLogger, Logger, LoggerOptions } from 'winston';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService extends ConsoleLogger implements LoggerService {
  private readonly $$logger: Logger;
  static $$lastLogTimestamp: number;

  constructor(@Inject('LoggerOptions') options: LoggerOptions) {
    super();

    LoggerService.$$lastLogTimestamp = Date.now();
    this.$$logger = createLogger(options);
  }

  private getAndSetTimeDiff(): string {
    const currentTime = Date.now();
    const diff = currentTime - LoggerService.$$lastLogTimestamp;
    LoggerService.$$lastLogTimestamp = currentTime; // Update for the next log
    return `+${diff}ms`;
  }

  public access(
    message: string,
    context?: string,
    ...extraDetails: any[]
  ): void {
    const msDiff = this.getAndSetTimeDiff();
    const [
      method,
      originalUrl,
      statusCode,
      duration,
      userAgent,
      ip,
      contentLength,
    ] = extraDetails;
    this.$$logger.log('access', message, {
      context: context || this.context,
      msDiff,
      method,
      originalUrl,
      statusCode,
      duration,
      userAgent,
      ip,
      contentLength,
    });
  }

  public log(message: string, context?: string, ...extraDetails: any[]): void {
    const msDiff = this.getAndSetTimeDiff();
    this.$$logger.info(message, { context: context || this.context, msDiff, extraDetails });
  }

  public error(
    message: string,
    trace?: string,
    context?: string,
    ...extraDetails: any[]
  ): void {
    const msDiff = this.getAndSetTimeDiff();
    this.$$logger.error(message, { trace, context: context || this.context, msDiff, extraDetails });
  }

  public warn(message: string, context?: string, ...extraDetails: any[]): void {
    const msDiff = this.getAndSetTimeDiff();
    this.$$logger.warn(message, { contexcontext: context || this.context, msDiff, extraDetails });
  }

  public debug(
    message: string,
    context?: string,
    ...extraDetails: any[]
  ): void {
    const msDiff = this.getAndSetTimeDiff();
    this.$$logger.debug(message, { context: context || this.context, msDiff, extraDetails });
  }

  public verbose(
    message: string,
    context?: string,
    ...extraDetails: any[]
  ): void {
    const msDiff = this.getAndSetTimeDiff();
    this.$$logger.verbose(message, { context: context || this.context, msDiff, extraDetails });
  }
}
