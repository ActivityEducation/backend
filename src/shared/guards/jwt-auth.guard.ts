import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport'; // Base AuthGuard from @nestjs/passport
import { CustomLogger } from '../../core/custom-logger.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') { // Extends Passport's JWT strategy
  constructor(private readonly logger: CustomLogger) {
    super(); // Call the constructor of the base AuthGuard
    this.logger.setContext('JwtAuthGuard'); // Set context for the logger
  }

  /**
   * Overrides the default `canActivate` method from `AuthGuard`.
   * This method is called before a route handler is executed.
   * @param context The execution context, providing access to the request, response, etc.
   * @returns A boolean or a Promise<boolean> indicating if the request is allowed.
   */
  canActivate(context: ExecutionContext) {
    this.logger.debug('Attempting to activate JWT Auth Guard.');
    // The `super.canActivate(context)` call triggers the Passport-JWT authentication flow.
    // It will validate the JWT using the `JwtStrategy` and attach the validated user
    // object to `req.user` if successful. If validation fails, it will throw an error.
    return super.canActivate(context);
  }
}