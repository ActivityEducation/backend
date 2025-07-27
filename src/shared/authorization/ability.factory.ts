// src/shared/authorization/ability.factory.ts
import { Ability, AbilityBuilder, AbilityClass, ExtractSubjectType, InferSubjects } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { UserEntity } from 'src/features/auth/entities/user.entity';
import { PermissionConfigService, PermissionRule } from '../config/permission-config.service';
import { UserRole } from 'src/features/auth/enums/user-role.enum';
import { LoggerService } from '../services/logger.service';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

// Define the subjects that permissions can apply to.
// 'all' means any subject.
export type Subjects = InferSubjects<any> | 'all'; // Exported
// Define the actions that can be performed.
// This should align with CRUD operations and custom actions.
export type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete' | 'like' | 'boost'; // 'manage' is a special CASL action meaning any action. // Exported

export type AppAbility = Ability<[Actions, Subjects]>;

@Injectable()
export class AbilityFactory {
  constructor(
    private readonly permissionConfigService: PermissionConfigService,
    private readonly logger: LoggerService,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis, // Inject Redis client
  ) {
    this.logger.setContext('AbilityFactory');
  }

  /**
   * Creates an Ability instance for a given user, defining what actions they can perform
   * on which subjects based on their assigned roles and the loaded permission rules.
   * Caches the ability in Redis for performance.
   *
   * @param user The authenticated user entity.
   * @returns An AppAbility instance.
   */
  async createForUser(user: UserEntity): Promise<AppAbility> {
    const userId = user.id;
    const cacheKey = `rbac:ability:${userId}`;

    // Try to retrieve from cache
    let cachedAbility = await this.redisClient.get(cacheKey);
    let userRolesFromCache: string[] | undefined;

    if (cachedAbility) {
      try {
        // Attempt to parse cached ability and extract roles (if stored with rules)
        // For simplicity, we'll assume rules are just the CASL rules array.
        // To properly check against roles from cache, we'd need to store roles alongside rules.
        // For now, we'll rely on the JWT roles vs DB roles check.

        // If roles were explicitly stored in the cache alongside rules, retrieve them here.
        // Example: { rules: [...], roles: ["user", "admin"] }
        // For now, we'll assume the cache only stores rules and rely on DB for comparison.

        // Reconstruct Ability from JSON string for immediate use if valid
        const rules = JSON.parse(cachedAbility);
        const ability = new Ability<[Actions, Subjects]>(rules, {
          detectSubjectType: (object) => object.constructor.name as ExtractSubjectType<Subjects>,
        });

        // --- NEW CACHE VALIDATION LOGIC ---
        // Fetch the user again from the DB to get their absolute latest roles
        const latestUser = await this.permissionConfigService['userRepository'].findOne({
          where: { id: userId },
          select: ['roles'], // Only fetch roles to minimize overhead
        });

        if (latestUser && JSON.stringify(latestUser.roles.sort()) === JSON.stringify(user.roles.sort())) {
          // If roles from JWT match roles from DB, and cache exists, use cache
          this.logger.debug(`Cache hit for user ${user.username}'s abilities. Roles match DB.`);
          return ability;
        } else {
          // Roles in JWT (which came from DB via JwtStrategy) do not match latest DB roles,
          // OR roles in JWT do not match what was used to build the cached ability (implicit).
          // Invalidate cache and rebuild.
          this.logger.warn(`AbilityFactory: Stale roles detected for user ${user.username} (ID: ${userId}). JWT roles: ${JSON.stringify(user.roles)}, DB roles: ${JSON.stringify(latestUser?.roles)}. Invalidating cache.`);
          await this.redisClient.del(cacheKey);
          cachedAbility = null; // Mark as no longer cached
        }
      } catch (error) {
        this.logger.error(`AbilityFactory: Failed to parse cached abilities for user ${user.username}: ${error.message}. Invalidating cache.`, error.stack);
        await this.redisClient.del(cacheKey);
        cachedAbility = null;
      }
    }

    // If no valid cache, create new abilities
    this.logger.log(`Creating new abilities for user: ${user.username}, Roles: ${user.roles.join(', ')}`);
    this.logger.debug(`AbilityFactory: User ${user.username} has roles (from JWT payload): ${JSON.stringify(user.roles)}`);

    const { can, cannot, build } = new AbilityBuilder<AppAbility>(Ability as AbilityClass<AppAbility>);

    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [UserRole.GUEST];

    for (const role of userRoles) {
      const permissions = this.permissionConfigService.getPermissionsForRole(role);
      this.logger.debug(`AbilityFactory: Permissions for role '${role}': ${JSON.stringify(permissions)}`);

      for (const permission of permissions) {
        const processedConditions = this.processConditions(permission.conditions, user);
        const fields = permission.fields ? permission.fields.split(',') : undefined;

        if (permission.type === 'allow') {
          can(
            permission.action as Actions,
            permission.subject as Subjects,
            fields,
            processedConditions as object | undefined,
          );
          this.logger.debug(`User ${user.username} (role: ${role}) CAN ${permission.action} on ${permission.subject} with conditions: ${JSON.stringify(processedConditions)}`);
        } else if (permission.type === 'deny') {
          cannot(
            permission.action as Actions,
            permission.subject as Subjects,
            fields,
            processedConditions as object | undefined,
          );
          this.logger.debug(`User ${user.username} (role: ${role}) CANNOT ${permission.action} on ${permission.subject} with conditions: ${JSON.stringify(processedConditions)}`);
        }
      }
    }

    const ability = build({
      detectSubjectType: (object) => object.constructor.name as ExtractSubjectType<Subjects>,
    });

    // Cache the newly created ability (rules only)
    await this.redisClient.set(cacheKey, JSON.stringify(ability.rules), 'EX', 3600); // Cache for 1 hour
    this.logger.debug(`Cached abilities for user ${user.username}.`);

    return ability;
  }

  /**
   * Processes conditions in permission rules, replacing dynamic placeholders
   * like '{{user.id}}' with actual user data.
   *
   * @param conditions The conditions object from the permission rule.
   * @param user The UserEntity object.
   * @returns The conditions object with placeholders replaced.
   */
  private processConditions(conditions: object | undefined, user: UserEntity): object | undefined {
    if (!conditions) {
      return undefined;
    }

    let processed = JSON.stringify(conditions);
    // Replace {{user.id}} with the actual user ID
    processed = processed.replace(/"\{\{user\.id\}\}"/g, `"${user.id}"`);
    // Add more replacements for other user properties if needed, e.g., {{user.email}}

    try {
      return JSON.parse(processed);
    } catch (e) {
      this.logger.error(`Failed to parse processed conditions: ${processed}. Error: ${e.message}`, e.stack);
      return conditions; // Return original conditions if parsing fails
    }
  }
}
