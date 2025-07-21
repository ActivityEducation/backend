import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import * as jsonld from 'jsonld';

// Required for custom loading of contexts
import '../contexts/custom-document.loader';

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
  async (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    let _body: jsonld;
    let parsedBody: any; // Use 'any' to be flexible with parsed JSON structure

    // Prioritize rawBody if available, as it's explicitly configured for ActivityPub JSON-LD
    if ((request as any).rawBody instanceof Buffer) {
      try {
        parsedBody = JSON.parse((request as any).rawBody.toString('utf8'));
      } catch (error) {
        throw new BadRequestException(`Invalid JSON payload from rawBody: ${error.message}`);
      }
    } else if (request.body instanceof Buffer) {
      // Fallback to request.body if it's a Buffer (e.g., if rawBody wasn't explicitly set by NestFactory)
      try {
        parsedBody = JSON.parse(request.body.toString('utf8'));
      } catch (error) {
        throw new BadRequestException(`Invalid JSON payload from body (Buffer): ${error.message}`);
      }
    } else if (request.body && typeof request.body === 'object' && request.body !== null) {
      // If request.body is already a parsed object (e.g., by another bodyParser.json() middleware)
      // and it's not a Buffer, use it directly.
      // This check ensures we don't try to parse an already parsed object.
      parsedBody = request.body;
    } else {
      // If none of the above, the raw body was not found or not in expected format
      throw new BadRequestException(
        'Raw request body not found or not in expected format. Ensure rawBody: true in NestFactory.create() and bodyParser.raw() middleware are configured correctly for ActivityPub content types.',
      );
    }

    try {
      // Define the target context for compaction.
      // This context tells jsonld.js how to interpret and compact the terms.
      // It should include both ActivityStreams and your EducationPub context.
      const targetContext = {
        '@context': [
          'https://www.w3.org/ns/activitystreams',
          'https://schema.org/',
          'https://w3id.org/security/v1',
          'https://w3id.org/identity/v1',
          'https://social.bleauweb.org/ns/education-pub',
          // Add other contexts if your application uses them
        ],
      };

      console.log('_body before compact:', JSON.stringify(parsedBody, null, 2));

      // Use jsonld.compact to process the incoming JSON-LD.
      // This will validate the context, expand terms, and then compact them
      // back into a more convenient form based on the targetContext.
      // For example, "edu:fieldName" might become "eduFieldName" if defined in your edu-ns context.
      const compactedActivity = await jsonld.compact(
        parsedBody,
        targetContext,
      );

      // Basic validation: ensure the compacted object still has a type and ID
      if (!compactedActivity.type || !compactedActivity.id) {
        throw new BadRequestException(
          'Compacted ActivityPub object is missing required "type" or "id" properties after JSON-LD processing.',
        );
      }

      return compactedActivity;
    } catch (error) {
      // jsonld.js can throw various errors (e.g., if context is invalid, or parsing issues)
      // Catch specific jsonld errors or re-throw as BadRequestException
      if (error instanceof SyntaxError) {
        throw new BadRequestException(`Invalid JSON payload: ${error.message}`);
      }
      // You might want more specific error handling for jsonld.js errors
      throw new BadRequestException(
        `Failed to process ActivityPub JSON-LD payload: ${error.message}`,
      );
    }
  },
);
