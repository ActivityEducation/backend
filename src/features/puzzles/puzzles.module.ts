import { Module } from '@nestjs/common';
import { PuzzleController } from './controllers/puzzle.controller';
import { CrosswordService } from './services/crossword.service';
import { WordSearchService } from './services/word-search.service';
import { MatchingGameService } from './services/matching-game.service';
import { AnagramsService } from './services/anagrams.service';
import { PdfService } from './services/pdf.service';

@Module({
  controllers: [PuzzleController],
  providers: [
    CrosswordService,
    WordSearchService,
    MatchingGameService,
    AnagramsService,
    PdfService,
  ],
})
export class PuzzleModule {}
