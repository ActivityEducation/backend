// src/features/educationpub/educationpub.module.ts
// Updated to include new entities and services

import { forwardRef, Module } from "@nestjs/common";
import { ActivityPubModule } from "../activitypub/activitypub.module";
import { CoreModule } from "src/core/core.module";
import { CommonModule } from "src/shared/common.module";
import { FlashcardService } from "./services/flashcard.service";
import { FlashcardModelService } from "./services/flashcard-model.service"; // New service
import { EducationPubController } from "./controllers/flashcard.controller"; // Renamed from FlashcardController for clarity on primary role
import { FlashcardModelController } from "./controllers/flashcard-model.controller"; // New controller
import { TypeOrmModule } from "@nestjs/typeorm";
import { Flashcard } from "./views/flashcard.view"; // Keep view if still used as a view
import { FlashcardEntity } from "./entities/flashcard.entity"; // Import new FlashcardEntity
import { FlashcardModelEntity } from "./entities/flashcard-model.entity"; // Import new FlashcardModelEntity

@Module({
    imports: [
        forwardRef(() => CoreModule),
        CommonModule,
        forwardRef(() => ActivityPubModule),
        TypeOrmModule.forFeature([Flashcard, FlashcardEntity, FlashcardModelEntity]) // Register new entities and old view
    ],
    controllers: [EducationPubController, FlashcardModelController], // Register new controllers
    providers: [FlashcardService, FlashcardModelService], // Register new services
    exports: [FlashcardService, FlashcardModelService], // Export new services if needed by other modules
})
export class EducationPubModule {
  // This module can be used to encapsulate education-related features
  // such as courses, lessons, and educational content.
}
