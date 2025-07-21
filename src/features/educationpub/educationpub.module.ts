import { Module } from "@nestjs/common";
import { ActivityPubModule } from "../activitypub/activitypub.module";
import { CoreModule } from "src/core/core.module";
import { CommonModule } from "src/shared/common.module";
import { FlashcardService } from "./services/flashcard.service";
import { EducationPubController } from "./controllers/flashcard.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Flashcard } from "./views/flashcard.view";

@Module({
    imports: [
        CoreModule,
        CommonModule,
        ActivityPubModule,
        TypeOrmModule.forFeature([Flashcard])
    ],
    // controllers: [EducationPubController],
    providers: [FlashcardService],
    exports: [],
})
export class EducationPubModule {
  // This module can be used to encapsulate education-related features
  // such as courses, lessons, and educational content.
}