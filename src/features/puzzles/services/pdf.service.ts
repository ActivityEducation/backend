// ---------------------------------------------------
// PDF Service - /src/puzzles/pdf.service.ts
// A simplified service for generating PDFs of the various puzzles.
// ---------------------------------------------------
import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { CrosswordService } from './crossword.service';
import { WordSearchService } from './word-search.service';
import { MatchingGameService } from './matching-game.service';
import { AnagramsService } from './anagrams.service';
import { VocabularyItemDto } from '../dto/vocabulary-item.dto';
import * as puppeteer from 'puppeteer';

@Injectable()
export class PdfService {
  constructor(
    private readonly crosswordService: CrosswordService,
    private readonly wordSearchService: WordSearchService,
    private readonly matchingGameService: MatchingGameService,
    private readonly anagramsService: AnagramsService,
  ) {}

  private getBaseStyles(): string {
    return `
      body { font-family: Helvetica, Arial, sans-serif; margin: 40px; }
      h1 { text-align: center; font-size: 24px; margin-bottom: 30px; }
      h2 { font-size: 18px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
      ul { list-style-type: none; padding: 0; margin: 0; font-size: 12px; }
      li { margin-bottom: 8px; }
      .puzzle-section { page-break-after: always; }
      .content-section { page-break-inside: avoid; }
      .answer-key-section { page-break-before: always; }
    `;
  }

  private getCrosswordHtml(puzzle): string {
    const { grid, clues } = puzzle;
    const numCols = grid[0].length;
    const cellWidthPercent = 100 / numCols;

    const gridHtml = grid.flat().map(cell => {
        if (cell) {
            return `<div class="crossword-cell" style="width: ${cellWidthPercent}%;">
                        ${cell.number ? `<span class="number">${cell.number}</span>` : ''}
                    </div>`;
        }
        return `<div class="crossword-cell empty" style="width: ${cellWidthPercent}%;"></div>`;
    }).join('');

    const answerGridHtml = grid.flat().map(cell => {
        if (cell) {
            return `<div class="crossword-cell" style="width: ${cellWidthPercent}%;">
                        <span class="answer-char">${cell.char}</span>
                    </div>`;
        }
        return `<div class="crossword-cell empty" style="width: ${cellWidthPercent}%;"></div>`;
    }).join('');

    const acrossCluesHtml = clues.across.map(clue => `<li><b>${clue.number}.</b> ${clue.text}</li>`).join('');
    const downCluesHtml = clues.down.map(clue => `<li><b>${clue.number}.</b> ${clue.text}</li>`).join('');

    return `
        <html>
            <head>
                <style>
                    ${this.getBaseStyles()}
                    .crossword-grid { display: flex; flex-wrap: wrap; border: 1px solid #80808080; max-width: 100%; aspect-ratio: 1 / 1; }
                    .crossword-cell { box-sizing: border-box; border: 1px solid #80808080; aspect-ratio: 1 / 1; position: relative; display: flex; justify-content: center; align-items: center; }
                    .crossword-cell.empty { background-color: #80808080; border: 1px solid #80808080; }
                    .number { position: absolute; top: 1px; left: 2px; font-size: 8px; }
                    .answer-char { font-size: 14px; text-transform: uppercase; }
                    .clues-section { display: flex; justify-content: space-between; gap: 20px; }
                    .clue-column { width: 48%; }
                </style>
            </head>
            <body>
                <h1>Crossword Puzzle</h1>
                <div class="puzzle-section">
                    <div class="crossword-grid">
                        ${gridHtml}
                    </div>
                </div>
                <div class="clues-section content-section">
                    <div class="clue-column">
                        <h2>Across</h2>
                        <ul>${acrossCluesHtml}</ul>
                    </div>
                    <div class="clue-column">
                        <h2>Down</h2>
                        <ul>${downCluesHtml}</ul>
                    </div>
                </div>
                <div class="answer-key-section">
                    <h1>Answer Key</h1>
                    <div class="crossword-grid">
                        ${answerGridHtml}
                    </div>
                </div>
            </body>
        </html>
    `;
  }

  private getWordSearchHtml(puzzle): string {
      const { grid, wordsToFind } = puzzle;
      const gridHtml = grid.map(row => 
          `<div class="ws-row">${row.map(cell => 
              `<div class="ws-cell">${cell}</div>`
          ).join('')}</div>`
      ).join('');

      const wordsHtml = wordsToFind.map(item => `<li>${item.word}</li>`).join('');

      return `
          <html>
              <head>
                  <style>
                      ${this.getBaseStyles()}
                      .ws-grid { display: grid; grid-template-columns: repeat(${grid[0].length}, 1fr); gap: 4px; text-align: center; }
                      .ws-row { display: contents; }
                      .ws-cell { font-size: 14px; text-transform: uppercase; }
                      .word-list { column-count: 3; column-gap: 20px; }
                  </style>
              </head>
              <body>
                  <h1>Word Search</h1>
                  <div class="puzzle-section">
                      <div class="ws-grid">${gridHtml}</div>
                  </div>
                  <div class="content-section">
                      <h2>Words to Find</h2>
                      <ul class="word-list">${wordsHtml}</ul>
                  </div>
                  <div class="answer-key-section">
                      <h1>Answer Key</h1>
                      <ul class="word-list">${wordsHtml}</ul>
                  </div>
              </body>
          </html>
      `;
  }

  private getMatchingGameHtml(puzzle): string {
      const { words, shuffledDefinitions } = puzzle;
      const wordsHtml = words.map((word, i) => `<li><b>${i + 1}.</b> ${word.word}</li>`).join('');
      const defsHtml = shuffledDefinitions.map((def, i) => `<li><b>${String.fromCharCode(65 + i)}.</b> ${def}</li>`).join('');
      const keyHtml = words.map((word, i) => `<li><b>${i + 1}. ${word.word}:</b> ${word.definition}</li>`).join('');

      return `
          <html>
              <head>
                  <style>
                      ${this.getBaseStyles()}
                      .matching-container { display: flex; justify-content: space-between; gap: 40px; }
                      .matching-column { width: 48%; }
                  </style>
              </head>
              <body>
                  <h1>Matching Game</h1>
                  <p>Match each word to its correct definition.</p>
                  <div class="matching-container content-section puzzle-section">
                      <div class="matching-column">
                          <h2>Words</h2>
                          <ul>${wordsHtml}</ul>
                      </div>
                      <div class="matching-column">
                          <h2>Definitions</h2>
                          <ul>${defsHtml}</ul>
                      </div>
                  </div>
                  <div class="answer-key-section">
                      <h1>Answer Key</h1>
                      <ul>${keyHtml}</ul>
                  </div>
              </body>
          </html>
      `;
  }

  private getAnagramsHtml(puzzle): string {
      const anagramsHtml = puzzle.map(item => 
          `<li><b>${item.scrambledWord}</b><br/><small>${item.definition}</small></li>`
      ).join('');
      const keyHtml = puzzle.map(item => `<li><b>${item.scrambledWord}:</b> ${item.originalWord}</li>`).join('');

      return `
          <html>
              <head>
                  <style>
                      ${this.getBaseStyles()}
                      .anagram-list li { border-bottom: 1px solid #eee; padding-bottom: 8px; }
                      .anagram-list small { color: #555; }
                  </style>
              </head>
              <body>
                  <h1>Anagrams</h1>
                  <p>Unscramble each word using its definition as a clue.</p>
                  <div class="puzzle-section">
                      <ul class="anagram-list content-section">${anagramsHtml}</ul>
                  </div>
                  <div class="answer-key-section">
                      <h1>Answer Key</h1>
                      <ul class="anagram-list">${keyHtml}</ul>
                  </div>
              </body>
          </html>
      `;
  }

  private async generatePdfFromHtml(htmlContent: string): Promise<Buffer> {
      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true });
      await browser.close();
      return Buffer.from(pdfBuffer);
  }

  async generateCrosswordPdf(vocabulary: VocabularyItemDto[]): Promise<Buffer> {
    const puzzle = this.crosswordService.generatePuzzle(vocabulary);
    
    if (puzzle.error || !puzzle.grid || puzzle.grid.length === 0) {
        const doc = await PDFDocument.create();
        const page = doc.addPage();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        page.drawText(puzzle.error || 'Could not generate a puzzle.', {
            x: 50,
            y: page.getHeight() / 2,
            font,
            size: 12,
        });
        const pdfBytes = await doc.save();
        return Buffer.from(pdfBytes);
    }
    
    const htmlContent = this.getCrosswordHtml(puzzle);
    return this.generatePdfFromHtml(htmlContent);
  }

  async generateWordSearchPdf(vocabulary: VocabularyItemDto[]): Promise<Buffer> {
    const puzzle = this.wordSearchService.generate(vocabulary);
    const htmlContent = this.getWordSearchHtml(puzzle);
    return this.generatePdfFromHtml(htmlContent);
  }

  async generateMatchingGamePdf(vocabulary: VocabularyItemDto[]): Promise<Buffer> {
    const puzzle = this.matchingGameService.generate(vocabulary);
    const htmlContent = this.getMatchingGameHtml(puzzle);
    return this.generatePdfFromHtml(htmlContent);
  }

  async generateAnagramsPdf(vocabulary: VocabularyItemDto[]): Promise<Buffer> {
    const puzzle = this.anagramsService.generate(vocabulary);
    const htmlContent = this.getAnagramsHtml(puzzle);
    return this.generatePdfFromHtml(htmlContent);
  }
}
