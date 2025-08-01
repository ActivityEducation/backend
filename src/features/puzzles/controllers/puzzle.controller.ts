import { Controller, Post, Body, ValidationPipe, UsePipes, Res } from '@nestjs/common';
import { CrosswordService } from '../services/crossword.service';
import { WordSearchService } from '../services/word-search.service';
import { CreatePuzzleDto } from '../dto/create-puzzle.dto';
import { MatchingGameService } from '../services/matching-game.service';
import { AnagramsService } from '../services/anagrams.service';
import { PdfService } from '../services/pdf.service';
import { Response } from 'express';

@Controller('puzzles')
export class PuzzleController {
  constructor(
    private readonly crosswordService: CrosswordService,
    private readonly wordSearchService: WordSearchService,
    private readonly matchingGameService: MatchingGameService,
    private readonly anagramsService: AnagramsService,
    private readonly pdfService: PdfService,
  ) {}

  @Post('crossword')
  @UsePipes(new ValidationPipe({ transform: true }))
  createCrossword(@Body() createPuzzleDto: CreatePuzzleDto) {
    return this.crosswordService.generatePuzzle(createPuzzleDto.vocabulary);
  }

  @Post('wordsearch')
  @UsePipes(new ValidationPipe({ transform: true }))
  createWordSearch(@Body() createPuzzleDto: CreatePuzzleDto) {
    return this.wordSearchService.generate(createPuzzleDto.vocabulary);
  }

  @Post('matching-game')
  @UsePipes(new ValidationPipe({ transform: true }))
  createMatchingGame(@Body() createPuzzleDto: CreatePuzzleDto) {
    return this.matchingGameService.generate(createPuzzleDto.vocabulary);
  }

  @Post('anagrams')
  @UsePipes(new ValidationPipe({ transform: true }))
  createAnagrams(@Body() createPuzzleDto: CreatePuzzleDto) {
    return this.anagramsService.generate(createPuzzleDto.vocabulary);
  }

  @Post('crossword/pdf')
  @UsePipes(new ValidationPipe({ transform: true }))
  async downloadCrosswordPdf(@Body() createPuzzleDto: CreatePuzzleDto, @Res() res: Response) {
    const pdfBuffer = await this.pdfService.generateCrosswordPdf(createPuzzleDto.vocabulary);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=crossword.pdf',
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post('wordsearch/pdf')
  @UsePipes(new ValidationPipe({ transform: true }))
  async downloadWordSearchPdf(@Body() createPuzzleDto: CreatePuzzleDto, @Res() res: Response) {
    const pdfBuffer = await this.pdfService.generateWordSearchPdf(createPuzzleDto.vocabulary);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=wordsearch.pdf',
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post('matching-game/pdf')
  @UsePipes(new ValidationPipe({ transform: true }))
  async downloadMatchingGamePdf(@Body() createPuzzleDto: CreatePuzzleDto, @Res() res: Response) {
    const pdfBuffer = await this.pdfService.generateMatchingGamePdf(createPuzzleDto.vocabulary);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=matching-game.pdf',
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post('anagrams/pdf')
  @UsePipes(new ValidationPipe({ transform: true }))
  async downloadAnagramsPdf(@Body() createPuzzleDto: CreatePuzzleDto, @Res() res: Response) {
    const pdfBuffer = await this.pdfService.generateAnagramsPdf(createPuzzleDto.vocabulary);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=anagrams.pdf',
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}