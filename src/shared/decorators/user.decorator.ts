import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Custom parameter decorator to extract the authenticated user object (or a specific property)
 * from the request. This simplifies accessing user data in controllers.
 * Usage: `@User() user: UserDto` or `@User('id') userId: string`.
 */
export const User = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user; // Passport attaches the validated user object to `request.user`

    // If a specific property name is provided (e.g., 'id', 'username'), return that property.
    // Otherwise, return the entire user object.
    return data ? user?.[data] : user;
  },
);