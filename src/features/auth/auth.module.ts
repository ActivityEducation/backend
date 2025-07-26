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

@Module({
  imports: [
    forwardRef(() => CoreModule),
    forwardRef(() => ModerationModule),
    forwardRef(() => ActivityPubModule),
    // Register ActorEntity and UserEntity with TypeORM for use in AuthService
    // FIX: Ensure UserEntity is explicitly registered here.
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
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    JwtAuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}
