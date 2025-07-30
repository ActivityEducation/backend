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
import { ReviewLogEntity } from './entities/review-log.entity';
import { SpacedRepetitionScheduleEntity } from './entities/spaced-repetition-schedule.entity';
import { SpacedRepetitionService } from './services/spaced-repetition.service';
import { FSRSLogic } from './services/fsrs.logic';
import { SpacedRepetitionController } from './controllers/spaced-repetition.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
        FlashcardModelEntity, 
        FlashcardEntity, 
        ActorEntity,
        ReviewLogEntity,
        SpacedRepetitionScheduleEntity
    ]),
    forwardRef(() => AuthModule), // Import AuthModule to make AbilityFactory and other auth-related providers available
    CommonModule, // Import CommonModule to make LoggerService available
  ],
  providers: [FlashcardModelService, FlashcardService, SpacedRepetitionService, FSRSLogic],
  controllers: [EducationPubController, FlashcardModelController, SpacedRepetitionController],
  exports: [FlashcardModelService, FlashcardService, SpacedRepetitionService],
})
export class EducationPubModule {}