// src/shared/guards/abilities.guard.ts
import { CanActivate, ExecutionContext, Injectable, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityFactory, AppAbility, Actions, Subjects } from '../authorization/ability.factory'; // Import Actions and Subjects
import { CHECK_ABILITIES_KEY } from 'src/shared/decorators/check-abilities.decorator'; // Corrected import path to use absolute alias
import { AbilityTuple } from '@casl/ability'; // Keep AbilityTuple for clarity on decorator metadata structure
import { UserEntity } from 'src/features/auth/entities/user.entity';
import { LoggerService } from '../services/logger.service';

// Define a custom type for the abilities stored in metadata, including optional conditions
type RequiredAbilityTuple = [Actions, Subjects, object?];

@Injectable()
export class AbilitiesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private abilityFactory: AbilityFactory,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('AbilitiesGuard');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Retrieve requiredAbilities using the custom tuple type
    const requiredAbilities = this.reflector.get<RequiredAbilityTuple[]>(CHECK_ABILITIES_KEY, context.getHandler()) || [];
    if (requiredAbilities.length === 0) {
      this.logger.debug('No specific abilities required for this route. Allowing access.');
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user: UserEntity = req.user;

    if (!user) {
      this.logger.warn('AbilitiesGuard: No user found on request. Denying access.');
      throw new ForbiddenException('You must be authenticated to access this resource.');
    }

    const ability = await this.abilityFactory.createForUser(user);
    this.logger.debug(`AbilitiesGuard: User ${user.username} has abilities: ${JSON.stringify(ability.rules)}`);

    const isAuthorized = await Promise.all(requiredAbilities.map(async (requiredAbility: RequiredAbilityTuple) => { // Explicitly type requiredAbility
      // Destructure using the custom tuple type, conditions is now correctly optional
      const [action, subjectType, conditions] = requiredAbility;
      let subjectInstance: Subjects; // This will be either the string type or the fetched resource object

      // If conditions are present in the rule, we must use the fetched resource instance.
      // Otherwise, we use the subjectType string.
      if (conditions && typeof conditions === 'object' && Object.keys(conditions).length > 0) {
        // This is a resource-scoped check, so req.resource must be present
        if (req.resource && req.resource.constructor.name === subjectType) {
            subjectInstance = req.resource;
        } else {
            // Misconfiguration: conditions exist in rule, but resource not found/attached.
            this.logger.error(`AbilitiesGuard: Resource instance for subject type '${subjectType}' not found on request (expected for conditioned check).`);
            throw new InternalServerErrorException(`Authorization configuration error: Resource not found for conditioned check.`);
        }
      } else {
        // This is a general permission check (not resource-scoped by conditions)
        subjectInstance = subjectType;
      }

      // Call ability.can with the correct subjectInstance.
      // The 'conditions' from the rule are *not* passed as a separate argument here;
      // they are evaluated internally by CASL against the properties of 'subjectInstance'.
      const checkResult = ability.can(action as Actions, subjectInstance);

      this.logger.debug(`Checking ability: can('${action}', '${String(subjectType)}', ${JSON.stringify(conditions)}) for user ${user.username}. Result: ${checkResult}`);
      return checkResult;
    }));

    const allAuthorized = isAuthorized.every(result => result === true);
    if (!allAuthorized) {
      this.logger.warn(`AbilitiesGuard: User ${user.username} lacks required abilities. Denying access.`);
      throw new ForbiddenException('You do not have sufficient permissions to perform this action.');
    }
    return true;
  }
}
