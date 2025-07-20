import { UnauthorizedException } from "@nestjs/common";

/**
 * Custom exception for HTTP Signature verification failures.
 */
export class HttpSignatureVerificationError extends UnauthorizedException {
  constructor(message: string) {
    super(`HTTP Signature Verification Failed: ${message}`);
  }
}