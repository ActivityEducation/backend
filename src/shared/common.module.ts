// src/shared/common.module.ts

import { Module, Global, forwardRef } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { HttpSignatureVerificationGuard } from './guards/http-signature-verification.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { HttpSignatureVerificationError } from './exceptions/signature-verification.exception'; // Exceptions are usually just classes, not providers
import { InvalidSignatureException } from './exceptions/invalid-signature.exception';
import { InvalidDigestError } from './exceptions/invalid-digest.exception';
import { KeyManagementService } from './services/key-management.service';
import { CoreModule } from '../core/core.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActorEntity } from '../features/activitypub/entities/actor.entity';
import { provideLoggerOptions } from './services/logger-config.provider';
import { LoggerService } from './services/logger.service';

/**
 * CommonModule
 *
 * This module consolidates and exports all shared components such as guards,
 * filters, decorators, exceptions, and services. By making it a global module,
 * its providers will be available everywhere without needing to import it
 * into every feature module.
 *
 * However, it's generally recommended to *not* make modules global unless
 * absolutely necessary, as it can hide dependencies. For shared components
 * that are truly used across many features, it can be acceptable.
 * Alternatively, you can explicitly import CommonModule into specific
 * feature modules that require its providers.
 */
@Global() // Consider removing @Global() if you prefer explicit imports for better dependency visibility.
@Module({
  imports: [
    forwardRef(() => CoreModule),
    TypeOrmModule.forFeature([ActorEntity]),
  ], // Use forwardRef if this module is imported in a circular dependency scenario
  providers: [
    provideLoggerOptions(),
    LoggerService,
    // Guards
    JwtAuthGuard,
    HttpSignatureVerificationGuard,
    RateLimitGuard,

    // Filters (registered globally in main.ts or per controller)
    // Note: HttpExceptionFilter is typically registered via app.useGlobalFilters() in main.ts
    // or applied via @UseFilters() decorator. Listing it here makes it available for DI.
    HttpExceptionFilter,

    // Services
    KeyManagementService,

    // Exceptions are typically classes and not providers themselves,
    // unless they involve some DI for their construction.
    // They are listed here for completeness if they were to be injected.
    HttpSignatureVerificationError, // If this exception class needs DI for creation
    InvalidSignatureException, // If this exception class needs DI for creation
    InvalidDigestError, // If this exception class needs DI for creation
  ],
  exports: [
    LoggerService,
    // Export all providers that other modules might need to inject
    JwtAuthGuard,
    HttpSignatureVerificationGuard,
    RateLimitGuard,
    HttpExceptionFilter, // Exporting the filter allows it to be injected
    KeyManagementService,
    // Exceptions are generally not exported as they are instantiated directly or thrown
    // but if they were to be injected, they would need to be exported.
  ],
})
export class CommonModule {}

