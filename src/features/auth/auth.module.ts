// src/features/auth/auth.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActorEntity } from '../activitypub/entities/actor.entity';
import { CommonModule } from '../../shared/common.module';
import { CoreModule } from 'src/core/core.module';
import { ModerationModule } from '../moderation/moderation.module';
import { UserEntity } from './entities/user.entity';
import { ActivityPubModule } from '../activitypub/activitypub.module';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { AbilityFactory } from 'src/shared/authorization/ability.factory';
import { PermissionConfigService } from 'src/shared/config/permission-config.service';
import { AbilitiesGuard } from 'src/shared/guards/abilities.guard';


@Module({
  imports: [
    forwardRef(() => CoreModule),
    forwardRef(() => ModerationModule),
    forwardRef(() => ActivityPubModule),
    // Register ActorEntity and UserEntity with TypeORM for use in AuthService
    // Also, UserEntity is needed by PermissionConfigService.
    TypeOrmModule.forFeature([
      UserEntity, // Ensure UserEntity is registered
      ActorEntity // ActorEntity is also needed for AuthService
    ]),
    PassportModule,
    // Configure JwtModule asynchronously to load JWT secret from ConfigService
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '60m' },
      }),
    }),
    ConfigModule,
    CommonModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    AbilityFactory,
    PermissionConfigService, // This is where PermissionConfigService is provided
    AbilitiesGuard,
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    JwtAuthGuard,
    JwtModule,
    AbilityFactory,
    PermissionConfigService,
    AbilitiesGuard,
  ],
})
export class AuthModule {}
