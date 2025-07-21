import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './controllers/health.controller';
import { HttpModule } from '@nestjs/axios';
// import { RedisHealthModule } from '@nestjs-modules/ioredis';
import { CommonModule } from 'src/shared/common.module';
import { CoreModule } from 'src/core/core.module';

@Module({
  imports: [
    CommonModule,
    CoreModule,
    TerminusModule.forRoot({
      gracefulShutdownTimeoutMs: 1000,
    }),
    HttpModule,
    // RedisHealthModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}
