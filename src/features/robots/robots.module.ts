// src/features/robots/robots.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RobotsService } from './services/robots.service';
import { RobotsController } from './controllers/robots.controller';
import { RobotRuleEntity } from './entities/robot-rule.entity';
import { SitemapEntity } from './entities/sitemap.entity';
import { AuthModule } from 'src/features/auth/auth.module'; // Import AuthModule
import { CommonModule } from 'src/shared/common.module'; // Import CommonModule

@Module({
  imports: [
    TypeOrmModule.forFeature([RobotRuleEntity, SitemapEntity]),
    forwardRef(() => AuthModule), // Import AuthModule to make AbilityFactory available
    CommonModule, // Import CommonModule to make LoggerService available
  ],
  providers: [RobotsService],
  controllers: [RobotsController],
  exports: [RobotsService],
})
export class RobotsModule {}
