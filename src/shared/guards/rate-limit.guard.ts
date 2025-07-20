import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Inject } from '@nestjs/common';
import Redis from 'ioredis'; // Redis client for interacting with Redis
import { CustomLogger } from '../../core/custom-logger.service';

// For production, these values should be configurable via environment variables
const RATE_LIMIT_WINDOW_SECONDS = 60; // Time window for rate limiting (e.g., 1 minute)
const MAX_REQUESTS_PER_WINDOW = 100; // Maximum number of requests allowed per IP within the window

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly logger: CustomLogger,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis, // Inject Redis client instance
  ) {
    this.logger.setContext('RateLimitGuard'); // Set context for the logger
  }

  /**
   * Determines if the current request is allowed based on rate limits.
   * Uses Redis to track request counts per IP address within a fixed window.
   * @param context The execution context, providing access to the request.
   * @returns A boolean indicating if the request is allowed.
   * @throws HttpException (TOO_MANY_REQUESTS) if the rate limit is exceeded.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip; // Get the client's IP address

    if (!ip) {
      this.logger.warn('Rate Limit Guard: Could not determine IP address for rate limiting. Skipping guard.');
      // In a production environment, you might want to throw an error or use a default rate limit.
      return true; // Allow if IP cannot be determined (e.g., local testing without proper headers)
    }

    const key = `rate_limit:${ip}`; // Redis key for tracking requests from this IP
    // Increment the counter for this IP. Redis's INCR command is atomic.
    const count = await this.redisClient.incr(key);
    if (count === 1) {
      // If this is the first request in the window, set the expiry for the key.
      await this.redisClient.expire(key, RATE_LIMIT_WINDOW_SECONDS);
      this.logger.debug(`Rate limit key '${key}' initialized with expiry ${RATE_LIMIT_WINDOW_SECONDS}s.`);
    }

    if (count > MAX_REQUESTS_PER_WINDOW) {
      this.logger.warn(`Rate limit exceeded for IP: '${ip}'. Current count: ${count}, Max: ${MAX_REQUESTS_PER_WINDOW}.`);
      // Throw an HTTP 429 Too Many Requests exception
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    this.logger.debug(`Rate limit check for IP: '${ip}'. Current count: ${count}.`);
    return true; // Request is allowed
  }
}