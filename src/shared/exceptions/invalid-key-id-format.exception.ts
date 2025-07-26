import { InternalServerErrorException, UnauthorizedException } from "@nestjs/common";

/**
 * Custom exception for invalid key id format failures.
 */
export class InvalidKeyIdFormatException extends InternalServerErrorException {
  constructor(message: string) {
    super(`HTTP Signature Verification Failed: ${message}`);
  }
}