import { BadRequestException } from "@nestjs/common";

/**
 * Custom exception for invalid Digest header.
 */
export class InvalidDigestError extends BadRequestException {
  constructor(message: string) {
    super(`Invalid Digest: ${message}`);
  }
}