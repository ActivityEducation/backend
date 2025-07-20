import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Request, Response } from 'express'; // Express types for request and response
import { CustomLogger } from '../../core/custom-logger.service';

@Catch(HttpException) // Decorator to catch all HttpExceptions
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: CustomLogger) {
    this.logger.setContext('HttpExceptionFilter'); // Set context for the logger
  }

  /**
   * Catches an HttpException and formats the response consistently.
   * Logs the error details for debugging and monitoring.
   * @param exception The HttpException that was caught.
   * @param host The ArgumentsHost object, providing access to the request and response.
   */
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus(); // Get the HTTP status code of the exception
    const exceptionResponse = exception.getResponse(); // Get the response object/string from the exception

    // Format the error response consistently.
    // If exceptionResponse is a string, wrap it in an object. Otherwise, use it directly.
    const errorResponse = typeof exceptionResponse === 'string'
      ? { statusCode: status, message: exceptionResponse, timestamp: new Date().toISOString(), path: request.url }
      : { ...exceptionResponse as object, timestamp: new Date().toISOString(), path: request.url };

    // Log the error details for debugging. Include stack trace for server errors.
    this.logger.error(`HTTP Exception: ${status} - ${JSON.stringify(errorResponse)}`, exception.stack, request.url);

    // Send the formatted JSON error response with the appropriate HTTP status.
    response
      .status(status)
      .json(errorResponse);
  }
}