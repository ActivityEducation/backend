import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Custom exception for invalid HTTP Signatures.
 * This exception is thrown when an incoming HTTP request's signature
 * fails verification, indicating an unauthorized or tampered message.
 */
export class InvalidSignatureException extends HttpException {
  constructor(message: string = 'Invalid HTTP Signature') {
    // Call the parent HttpException constructor with a message and HTTP status code.
    // HttpStatus.UNAUTHORIZED (401) is appropriate for authentication/signature failures.
    super(message, HttpStatus.UNAUTHORIZED);
  }
}