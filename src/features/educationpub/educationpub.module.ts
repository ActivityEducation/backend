// src/features/educationpub/educationpub.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlashcardModelEntity } from './entities/flashcard-model.entity';
import { FlashcardEntity } from './entities/flashcard.entity';
import { FlashcardModelService } from './services/flashcard-model.service';
import { FlashcardService } from './services/flashcard.service';
import { EducationPubController } from './controllers/flashcard.controller'; // Renamed from FlashcardController
import { FlashcardModelController } from './controllers/flashcard-model.controller';
import { ActorEntity } from 'src/features/activitypub/entities/actor.entity';
import { AuthModule } from 'src/features/auth/auth.module'; // Import AuthModule
import { CommonModule } from 'src/shared/common.module'; // Import CommonModule

@Module({
  imports: [
    TypeOrmModule.forFeature([FlashcardModelEntity, FlashcardEntity, ActorEntity]),
    forwardRef(() => AuthModule), // Import AuthModule to make AbilityFactory and other auth-related providers available
    CommonModule, // Import CommonModule to make LoggerService available
  ],
  providers: [FlashcardModelService, FlashcardService],
  controllers: [EducationPubController, FlashcardModelController],
  exports: [FlashcardModelService, FlashcardService],
})
export class EducationPubModule {}
