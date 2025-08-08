// src/shared/guards/optional-jwt-auth.guard.ts

import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // If an error occurred during token validation (e.g., malformed, signature invalid)
    if (err) {
      // In a production app, you would log this error here for debugging
      return null;
    }
    // If no user was found (e.g., no token provided, or token valid but user not in DB)
    if (!user) {
      return null; // Don't throw an error; simply return a null user.
    }
    // If authentication was successful, return the user object.
    return user;
  }
}