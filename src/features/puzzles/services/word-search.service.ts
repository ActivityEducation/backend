import { Injectable as InjectableWordSearch } from '@nestjs/common';
import { VocabularyItemDto as WordSearchVocabularyItem } from '../dto/vocabulary-item.dto';

// Helper to shuffle an array
const shuffle = (array) => array.sort(() => Math.random() - 0.5);

@InjectableWordSearch()
export class WordSearchService {
  private readonly directions = [
    { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }, // E, S, SE
    { r: 0, c: -1 }, { r: -1, c: 0 }, { r: -1, c: -1 }, // W, N, NW
    { r: 1, c: -1 }, { r: -1, c: 1 } // SW, NE
  ];

  generate(vocabulary: WordSearchVocabularyItem[]) {
    const words = vocabulary.map(item => item.word.toUpperCase().replace(/\s/g, ''));
    const longestWord = Math.max(...words.map(w => w.length));
    const gridSize = Math.max(longestWord, Math.floor(words.length * 1.5));
    let grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));

    for (const word of words) {
      this._placeWordInGrid(word, grid, gridSize);
    }
    
    this._fillEmptyCells(grid, gridSize);

    return { grid, wordsToFind: vocabulary };
  }

  private _placeWordInGrid(word: string, grid: string[][], gridSize: number): boolean {
    const shuffledDirections = shuffle([...this.directions]);
    for (const direction of shuffledDirections) {
      const startRow = Math.floor(Math.random() * gridSize);
      const startCol = Math.floor(Math.random() * gridSize);

      if (this._canPlaceWordHere(word, grid, gridSize, startRow, startCol, direction)) {
        for (let i = 0; i < word.length; i++) {
          grid[startRow + i * direction.r][startCol + i * direction.c] = word[i];
        }
        return true;
      }
    }
    return false; // Could not place the word
  }

  private _canPlaceWordHere(word: string, grid: string[][], gridSize: number, r: number, c: number, dir: { r: number, c: number }): boolean {
    for (let i = 0; i < word.length; i++) {
      const newRow = r + i * dir.r;
      const newCol = c + i * dir.c;
      if (newRow < 0 || newRow >= gridSize || newCol < 0 || newCol >= gridSize) return false;
      const cell = grid[newRow][newCol];
      if (cell && cell !== word[i]) return false;
    }
    return true;
  }

  private _fillEmptyCells(grid: string[][], gridSize: number) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (!grid[r][c]) {
          grid[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
        }
      }
    }
  }
}