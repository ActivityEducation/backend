import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { KeyManagementService } from '../services/key-management.service';
import * as HttpSignature from '@peertube/http-signature'; // Changed: Import as namespace for @peertube/http-signature
import * as util from 'util'; // Re-added util for deep logging
import { CustomLogger } from '../../core/custom-logger.service';

/**
 * Custom exception for HTTP Signature verification failures.
 */
export class HttpSignatureVerificationError extends UnauthorizedException {
  constructor(message: string) {
    super(`HTTP Signature Verification Failed: ${message}`);
  }
}

/**
 * Custom exception for invalid Digest header.
 */
export class InvalidDigestError extends BadRequestException {
  constructor(message: string) {
    super(`Invalid Digest: ${message}`);
  }
}

/**
 * HttpSignatureVerificationGuard is a NestJS guard that verifies incoming
 * HTTP Signatures on requests, typically for ActivityPub Inbox endpoints.
 * It ensures the request's authenticity, integrity, and freshness.
 *
 * This version uses the '@peertube/http-signature' library for robust
 * and interoperability signature and digest verification, aligning with insights from the research.
 *
 * Specification: https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures-12
 * ActivityPub usage: https://www.w3.org/TR/activitypub/#http-signatures
 */
@Injectable()
export class HttpSignatureVerificationGuard implements CanActivate {
  private readonly MAX_CLOCK_SKEW_SECONDS = 300; // 5 minutes (5 * 60 seconds)

  constructor(
    private keyManagementService: KeyManagementService,
    private readonly logger: CustomLogger,
  ) {
    this.logger.setContext(HttpSignatureVerificationGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method;
    const requestUrl = new URL(req.originalUrl, `http://${req.headers.host}`); // Construct full URL for (request-target)

    this.logger.debug(
      `Attempting HTTP Signature verification for ${method} ${requestUrl.toString()}`,
    );

    const signatureHeader = req.headers['signature'] as string;
    const authHeader = req.headers['authorization'];

    if (!signatureHeader && !authHeader) {
      this.logger.warn('Neither Signature nor Authorization header found.');
      throw new HttpSignatureVerificationError('Missing HTTP Signature header.');
    }

    try {
      // Prepare the request object for the @peertube/http-signature library's parse function.
      // It expects a simple object with url, method, and headers.
      // It also needs the raw body as a buffer for digest calculation.
      // The library should handle the (request-target) internally and JSON-LD canonicalization.
      const requestForParse = { // Renamed for clarity that this is for parse()
        url: req.originalUrl,
        method: req.method,
        headers: req.headers, // Pass Express headers directly, library should handle structure
        body: req.rawBody instanceof Buffer ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}), 'utf8'),
      };

      // Log the request object being passed to the parser
      this.logger.debug(`requestForParse (for HttpSignature.parse): ${util.inspect(requestForParse, { depth: null, maxArrayLength: null, breakLength: Infinity, maxStringLength: Infinity })}`);

      // Parse the signature header using the library's parse function
      const parsedSignature: any = HttpSignature.parse(requestForParse);

      // Log the full parsed signature object returned by the library
      this.logger.debug(`Parsed signature object (raw from HttpSignature.parse): ${util.inspect(parsedSignature, { depth: null, maxArrayLength: null, breakLength: Infinity, maxStringLength: Infinity })}`);

      // --- START: Granular checks for parsedSignature components ---
      let missingComponents: string[] = [];
      if (!parsedSignature) {
        missingComponents.push('parsedSignature is null/undefined');
      } else {
        if (!parsedSignature.keyId) {
          missingComponents.push('keyId');
        }
        if (!parsedSignature.algorithm) {
          missingComponents.push('algorithm');
        }
        // Corrected: Use parsedSignature.params.headers for the headers array
        if (!Array.isArray(parsedSignature.params?.headers) || parsedSignature.params.headers.length === 0) {
          missingComponents.push('headers (not an array or empty)');
          this.logger.error(`Debug: parsedSignature.params?.headers type: ${typeof parsedSignature.params?.headers}, value: ${util.inspect(parsedSignature.params?.headers)}`);
        }
      }

      if (missingComponents.length > 0) {
        this.logger.error(`Failed to parse HTTP Signature header or missing required components: ${missingComponents.join(', ')}.`);
        throw new HttpSignatureVerificationError('Malformed or missing HTTP Signature header components.');
      }
      // --- END: Granular checks ---

      // Ensure algorithm is a string primitive for consistency and library compatibility
      const parsedAlgorithm = String(parsedSignature.algorithm);


      // The library's parsed signature object directly exposes keyId, algorithm, and headers.
      // Corrected: Use parsedSignature.params.headers for logging
      this.logger.debug(`Parsed Signature: keyId=${parsedSignature.keyId}, algorithm=${parsedAlgorithm}, headers=${parsedSignature.params.headers.join(' ')}`);

      // Check for supported algorithm (as per Mastodon's requirement for rsa-sha256)
      // The library might return 'hs2019' which resolves to rsa-sha256, or directly 'rsa-sha256'.
      // We check for both for robustness, as Mastodon uses 'hs2019' which maps to rsa-sha256.
      const effectiveAlgorithm = parsedAlgorithm.toLowerCase(); // Use the ensured string primitive
      if (effectiveAlgorithm !== "rsa-sha256" && effectiveAlgorithm !== "hs2019") {
        this.logger.error(`Unsupported signature algorithm: ${parsedAlgorithm}. Only rsa-sha256 or hs2019 is supported.`);
        throw new HttpSignatureVerificationError(`Unsupported signature algorithm: ${parsedAlgorithm}.`);
      }

      // Check date freshness (if 'date' header is signed)
      // Corrected: Use parsedSignature.params.headers for includes check
      if (parsedSignature.params.headers.includes('date')) {
        const dateHeader = req.headers['date'] as string;
        if (!dateHeader) {
          this.logger.error('Date header missing in actual request but required by signature.');
          throw new HttpSignatureVerificationError('Missing Date header in request.');
        }
        const requestDate = new Date(dateHeader);
        const now = new Date();
        const timeDiffSeconds = Math.abs((now.getTime() - requestDate.getTime()) / 1000);

        if (timeDiffSeconds > this.MAX_CLOCK_SKEW_SECONDS) {
          this.logger.warn(
            `Signature timestamp out of range. Created: ${requestDate.toISOString()}, Now: ${now.toISOString()}, Diff: ${timeDiffSeconds}s`
          );
          throw new HttpSignatureVerificationError(
            `Signature timestamp too old or too far in future (skew > ${this.MAX_CLOCK_SKEW_SECONDS}s).`,
          );
        }
        this.logger.debug(`Date header '${dateHeader}' is within acceptable range.`);
      }

      // Fetch the public key using the keyId from the parsed signature
      let publicKeyPem: string;
      try {
        publicKeyPem = await this.keyManagementService.getPublicKey(parsedSignature.keyId);
        if (!publicKeyPem) {
          this.logger.warn(`Public key not found for keyId: ${parsedSignature.keyId}.`);
          throw new HttpSignatureVerificationError(
            `Public key not found for keyId: ${parsedSignature.keyId}`,
          );
        }
        this.logger.debug(`Public key PEM fetched for keyId: ${parsedSignature.keyId}`);
      } catch (error) {
        this.logger.error(
          `Error fetching public key for ${parsedSignature.keyId}: ${error.message}`,
          error.stack,
        );
        throw new HttpSignatureVerificationError(
          `Failed to retrieve public key: ${error.message}`,
        );
      }

      // Verify the signature using the library's verify function.
      // It expects the parsed signature object and the public key PEM string.
      // The algorithm is derived internally from parsedSignature.algorithm.
      const isSignatureValid = await HttpSignature.verify(parsedSignature, publicKeyPem);

      if (!isSignatureValid) {
        this.logger.warn(`HTTP Signature verification failed for keyId: ${parsedSignature.keyId}. Signature invalid.`);
        throw new HttpSignatureVerificationError('Signature invalid.');
      }
      this.logger.debug(`HTTP Signature verified successfully for keyId: ${parsedSignature.keyId}.`);

    } catch (error) {
      this.logger.error(`Error during HTTP Signature verification: ${error.message}`, error.stack);
      // Re-throw specific errors if they are already HttpSignatureVerificationError or InvalidDigestError
      if (error instanceof HttpSignatureVerificationError || error instanceof InvalidDigestError || error instanceof BadRequestException) {
        throw error;
      }
      // Catching generic errors from the library or other parts and re-throwing as specific errors
      if (error.message.includes('Digest mismatch')) { // Example: if library throws specific message
        throw new InvalidDigestError(error.message);
      }
      // If the error message from the library indicates a parsing failure, map it.
      if (error.message.includes('Failed to parse signature string') || error.message.includes('Invalid signature header')) {
          throw new HttpSignatureVerificationError(`Signature header parsing failed: ${error.message}`);
      }
      throw new HttpSignatureVerificationError(`Signature verification failed unexpectedly: ${error.message}`);
    }

    return true; // Signature and Digest are valid, and timestamps are within range
  }
}
