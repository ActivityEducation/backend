// src/shared/common.module.ts

import { Module } from '@nestjs/common'; // Removed Global import
import { LoggerService } from './services/logger.service';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { provideLoggerOptions } from './services/logger-config.provider';
// Removed imports for guards and entities that are being moved/removed from here
// import { JwtAuthGuard } from './guards/jwt-auth.guard';
// import { HttpSignatureVerificationGuard } from './guards/http-signature-verification.guard';
// import { RateLimitGuard } from './guards/rate-limit.guard';
// import { ActorEntity } from '../features/activitypub/entities/actor.entity';
// import { TypeOrmModule } from '@nestjs/typeorm';
// import { forwardRef } from '@nestjs/common';
// import { CoreModule } from '../core/core.module'; // Removed this import

@Module({ // Removed @Global() decorator
  imports: [
    // Removed all imports from here
  ],
  providers: [
    provideLoggerOptions(),
    LoggerService,
    HttpExceptionFilter,
    // Removed guard providers and exception providers from here
    // JwtAuthGuard,
    // HttpSignatureVerificationError,
    // InvalidSignatureException,
    // InvalidDigestError,
    // HttpSignatureVerificationGuard,
    // RateLimitGuard,
  ],
  exports: [
    LoggerService,
    HttpExceptionFilter,
    // Removed guard exports from here
    // JwtAuthGuard,
    // HttpSignatureVerificationGuard,
    // RateLimitGuard,
  ],
})
export class CommonModule {}
