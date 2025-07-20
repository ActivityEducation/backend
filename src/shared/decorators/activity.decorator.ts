import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Custom parameter decorator to extract and parse the ActivityPub JSON-LD body
 * from the raw request body.
 *
 * This decorator assumes that `rawBody: true` is set in `NestFactory.create`
 * in `main.ts` and that `bodyParser.raw()` middleware is used to populate `req.rawBody` or `req.body` with the raw buffer.
 *
 * Usage:
 * @Post('actors/:username/inbox')
 * async inbox(@Param('username') username: string, @Activity() activity: any, @Req() req: Request) {
 * // activity will be the parsed JSON-LD object
 * // req.rawBody (or the original raw body from req.body) will still be available for HTTP Signature verification
 * }
 */
export const Activity = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();

    // Attempt to get the raw body from `req.rawBody` first, which is explicitly enabled by NestFactory's rawBody: true.
    // If `req.rawBody` is not available (e.g., due to middleware interaction),
    // try to get it from `req.body`, which `bodyParser.raw()` typically populates.
    let rawBodyBuffer: Buffer | undefined;

    if ((request as any).rawBody instanceof Buffer) {
      rawBodyBuffer = (request as any).rawBody;
    } else if (request.body instanceof Buffer) {
      rawBodyBuffer = request.body;
    }

    if (!rawBodyBuffer) {
      // This indicates that neither rawBody nor body contained the expected Buffer.
      throw new BadRequestException('Raw request body not found. Ensure rawBody: true in NestFactory.create() and bodyParser.raw() middleware are configured correctly.');
    }

    try {
      // Parse the raw buffer into a JSON object
      const parsedActivity = JSON.parse(rawBodyBuffer.toString('utf8'));
      return parsedActivity;
    } catch (error) {
      // If parsing fails, it indicates a malformed JSON payload
      throw new BadRequestException(`Invalid ActivityPub JSON-LD payload: ${error.message}`);
    }
  },
);
