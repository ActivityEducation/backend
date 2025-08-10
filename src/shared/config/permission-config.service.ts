// src/shared/config/permission-config.service.ts
import { Injectable, OnModuleInit, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../services/logger.service';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { UserEntity } from 'src/features/auth/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export interface PermissionRule {
  action: string; subject: string; conditions?: object; fields?: string; type?: 'allow' | 'deny';
}
interface RoleConfig { name: string; permissions: PermissionRule[]; }

@Injectable()
export class PermissionConfigService implements OnModuleInit {
  private rolesPermissionsMap: Map<string, PermissionRule[]>= new Map();
  private rolesYamlPath: string;

  constructor(
    private readonly configService: ConfigService, private readonly logger: LoggerService,
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
  ) {
    this.logger.setContext('PermissionConfigService');
    this.rolesYamlPath = path.join(process.cwd(), 'config', 'roles.yaml');
  }

  async onModuleInit() {
    await this.loadRolesAndPermissionsFromYaml();
    await this.checkStaleRolesOnStartup();
  }

  private async loadRolesAndPermissionsFromYaml(): Promise<void> {
    this.logger.log('Loading roles and permissions from YAML files...');
    try {
      if (!fs.existsSync(this.rolesYamlPath)) {
        this.logger.error(`Roles YAML file not found at: ${this.rolesYamlPath}. RBAC will be limited.`);
        return;
      }
      const rolesYamlContent = fs.readFileSync(this.rolesYamlPath, 'utf8');
      const yamlRoles: RoleConfig[] = yaml.load(rolesYamlContent) as RoleConfig[];

      this.rolesPermissionsMap.clear();
      for (const yamlRole of yamlRoles) {
        if (!yamlRole.name || !Array.isArray(yamlRole.permissions)) {
          this.logger.warn(`Malformed role entry in YAML: ${JSON.stringify(yamlRole)}. Skipping.`);
          continue;
        }
        this.rolesPermissionsMap.set( yamlRole.name, yamlRole.permissions.map(p => ({ ...p, type: p.type || 'allow' })) );
        this.logger.log(`Loaded role '${yamlRole.name}' with ${yamlRole.permissions.length} permissions.`);
      }
      this.logger.log(`Successfully loaded ${this.rolesPermissionsMap.size} roles from YAML.`);
    } catch (error) {
      this.logger.error(`Failed to load roles and permissions from YAML: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to load RBAC configuration. Check roles.yaml.');
    }
  }

  getPermissionsForRole(roleName: string): PermissionRule[] {
    return this.rolesPermissionsMap.get(roleName) || [];
  }

  getAllRoleNames(): string[] {
    return Array.from(this.rolesPermissionsMap.keys());
  }

  /**
   * Checks for and logs warnings about stale roles assigned to users
   * that are no longer defined in the roles.yaml configuration.
   * This runs on application startup.
   */
  private async checkStaleRolesOnStartup(): Promise<void> {
    this.logger.log('Checking for stale roles on application startup...');
    const allUsers = await this.userRepository.find({ select: ['id', 'username', 'roles'] });
    const definedRoleNames = this.getAllRoleNames();
    let staleRolesFound = false;

    for (const user of allUsers) {
      if (user.roles && user.roles.length > 0) {
        const staleRoles = user.roles.filter(role => !definedRoleNames.includes(role));
        if (staleRoles.length > 0) {
          staleRolesFound = true;
          this.logger.warn(
            `User '${user.username}' (ID: ${user.id}) has stale roles: [${staleRoles.join(', ')}]. ` +
            `These roles are not defined in roles.yaml. Consider running a CLI cleanup command.`,
          );
        }
      }
    }

    if (!staleRolesFound) {
      this.logger.log('No stale roles detected among users.');
    } else {
      this.logger.warn('Stale roles detected. Please address them using the provided CLI tooling.');
    }
  }

  // This method will be implemented in Phase 2
  async assignRolesToUser(userId: string, roleNames: string[]): Promise<UserEntity> {
    // Placeholder for Phase 2 implementation
    throw new InternalServerErrorException('assignRolesToUser not yet implemented in PermissionConfigService.');
  }
}
