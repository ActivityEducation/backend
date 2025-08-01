// ---------------------------------------------------
// Crossword Service - /src/puzzles/crossword.service.ts
// An improved service for generating crosswords using a backtracking algorithm.
// ---------------------------------------------------
import { Injectable } from '@nestjs/common';
import { VocabularyItemDto } from '../dto/vocabulary-item.dto';

// --- Type Definitions ---
type Direction = 'across' | 'down';
type Cell = { char: string; number?: number };
type Grid = (Cell | null)[][];
type PlacedWord = VocabularyItemDto & { row: number; col: number; direction: Direction };
type Placement = { word: string; row: number; col: number; direction: Direction; score: number };
type Clue = { number: number; text: string; word: string; };

// --- Helper Functions ---
const shuffleArray = (array: any[]) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

@Injectable()
export class CrosswordService {
  private readonly gridSize = 50; // Increased grid size for more complex puzzles

  /**
   * Main function to generate the crossword puzzle.
   * @param vocabulary The list of words and definitions.
   * @returns A generated puzzle object or an error object.
   */
  public generatePuzzle(vocabulary: VocabularyItemDto[]) {
    const words = shuffleArray([...vocabulary]).sort((a, b) => b.word.length - a.word.length);
    const solution = this.solve(words);

    if (!solution) {
      return { grid: [], clues: { across: [], down: [] }, error: "Could not generate a valid puzzle." };
    }

    const { grid, placedWords } = solution;
    const { trimmedGrid, minRow, minCol } = this.trimGrid(grid);
    const clues = this.generateClues(placedWords, minRow, minCol, trimmedGrid);

    return { grid: trimmedGrid, clues };
  }

  /**
   * Recursively solves the crossword puzzle using backtracking.
   * @param wordsToPlace The remaining words to place.
   * @param placedWords The words already placed on the grid.
   * @param grid The current state of the grid.
   * @returns A solution object if successful, otherwise null.
   */
  private solve(wordsToPlace: VocabularyItemDto[], placedWords: PlacedWord[] = [], grid: Grid | null = null): { grid: Grid; placedWords: PlacedWord[] } | null {
    if (grid === null) {
      grid = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(null));
    }

    if (wordsToPlace.length === 0) {
      return { grid, placedWords }; // Success base case
    }

    const currentWord = wordsToPlace[0];
    const remainingWords = wordsToPlace.slice(1);
    
    const placements = this.findPossiblePlacements(currentWord.word, grid, placedWords, remainingWords);
    placements.sort((a, b) => b.score - a.score); // Prioritize higher scores

    for (const placement of placements) {
      const { newGrid, newPlacedWords } = this.applyPlacement(placement, currentWord, grid, placedWords);
      const result = this.solve(remainingWords, newPlacedWords, newGrid);
      
      if (result) {
        return result; // Solution found, propagate it up
      }
    }

    return null; // Failure, backtrack
  }

  /**
   * Finds and scores all possible placements for a word.
   */
  private findPossiblePlacements(word: string, grid: Grid, placedWords: PlacedWord[], remainingWords: VocabularyItemDto[]): Placement[] {
    const placements: Placement[] = [];
    const upperCaseWord = word.toUpperCase();

    if (placedWords.length === 0) {
      const row = Math.floor(this.gridSize / 2);
      const col = Math.floor((this.gridSize - word.length) / 2);
      placements.push({ word: upperCaseWord, row, col, direction: 'across', score: 1 });
      return placements;
    }

    for (let i = 0; i < upperCaseWord.length; i++) {
      const charToMatch = upperCaseWord[i];
      for (const pWord of placedWords) {
        for (let j = 0; j < pWord.word.length; j++) {
          if (pWord.word.toUpperCase()[j] === charToMatch) {
            const direction: Direction = pWord.direction === 'across' ? 'down' : 'across';
            const row = direction === 'down' ? pWord.row - i : pWord.row + j;
            const col = direction === 'across' ? pWord.col - i : pWord.col + j;

            if (this.canPlaceWordAt(upperCaseWord, row, col, direction, grid)) {
              const score = this.calculatePlacementScore(upperCaseWord, row, col, direction, grid, remainingWords);
              placements.push({ word: upperCaseWord, row, col, direction, score });
            }
          }
        }
      }
    }
    return placements;
  }

  /**
   * Heuristic: Scores a placement based on how many new intersections it creates.
   */
  private calculatePlacementScore(word: string, row: number, col: number, direction: Direction, grid: Grid, remainingWords: VocabularyItemDto[]): number {
    let score = 0;
    for (let i = 0; i < word.length; i++) {
        const r = direction === 'down' ? row + i : row;
        const c = direction === 'across' ? col + i : col;
        if (!grid[r][c]) { // Only score new intersections, not existing ones
            for (const otherWord of remainingWords) {
                if (otherWord.word.toUpperCase().includes(word[i])) {
                    score++;
                }
            }
        }
    }
    return score;
  }

  /**
   * Applies a placement to a copy of the grid and returns the new state.
   */
  private applyPlacement(placement: Placement, wordObj: VocabularyItemDto, grid: Grid, placedWords: PlacedWord[]) {
    const newGrid = grid.map(row => [...row]); // Deep copy
    const newPlacedWords = [...placedWords];
    
    for (let i = 0; i < placement.word.length; i++) {
      const r = placement.direction === 'down' ? placement.row + i : placement.row;
      const c = placement.direction === 'across' ? placement.col + i : placement.col;
      newGrid[r][c] = { char: placement.word[i] };
    }
    
    newPlacedWords.push({ ...wordObj, row: placement.row, col: placement.col, direction: placement.direction });
    return { newGrid, newPlacedWords };
  }
  
  /**
   * Validates if a word can be placed at a specific location.
   */
  private canPlaceWordAt(word: string, row: number, col: number, direction: Direction, grid: Grid): boolean {
    if (row < 0 || col < 0 || (direction === 'across' && col + word.length > this.gridSize) || (direction === 'down' && row + word.length > this.gridSize)) return false;

    for (let i = 0; i < word.length; i++) {
        const r = direction === 'down' ? row + i : row;
        const c = direction === 'across' ? col + i : col;
        const existingCell = grid[r][c];

        if (existingCell && existingCell.char !== word[i]) return false;
        
        if (!existingCell) { // Check for adjacent conflicts only on empty cells
            if (direction === 'across' && ((r > 0 && grid[r - 1][c]) || (r < this.gridSize - 1 && grid[r + 1][c]))) return false;
            if (direction === 'down' && ((c > 0 && grid[r][c - 1]) || (c < this.gridSize - 1 && grid[r][c + 1]))) return false;
        }
    }
    // Check for words running alongside
    if (direction === 'across' && ((col > 0 && grid[row][col - 1]) || (col + word.length < this.gridSize && grid[row][col + word.length]))) return false;
    if (direction === 'down' && ((row > 0 && grid[row - 1][col]) || (row + word.length < this.gridSize && grid[row + word.length][col]))) return false;

    return true;
  }

  /**
   * Trims empty space around the generated puzzle.
   */
  private trimGrid(grid: Grid) {
    let minRow = this.gridSize, minCol = this.gridSize, maxRow = -1, maxCol = -1;
    for (let r = 0; r < this.gridSize; r++) for (let c = 0; c < this.gridSize; c++) if (grid[r][c]) {
        minRow = Math.min(minRow, r); minCol = Math.min(minCol, c); maxRow = Math.max(maxRow, r); maxCol = Math.max(maxCol, c);
    }
    const trimmedGrid = grid.slice(minRow, maxRow + 1).map(row => row.slice(minCol, maxCol + 1));
    return { trimmedGrid, minRow, minCol };
  }

  /**
   * Generates the clue list and adds numbers to the grid.
   */
  private generateClues(placedWords: PlacedWord[], minRow: number, minCol: number, trimmedGrid: Grid) {
    const clues: { across: Clue[]; down: Clue[] } = { across: [], down: [] };
    let clueNumber = 1;
    placedWords.sort((a, b) => (a.row * this.gridSize + a.col) - (b.row * this.gridSize + b.col));
    const wordStarts = {};

    placedWords.forEach(pWord => {
        const key = `${pWord.row},${pWord.col}`;
        if (!wordStarts[key]) wordStarts[key] = clueNumber++;
        const number = wordStarts[key];
        const clue: Clue = { number, text: pWord.definition, word: pWord.word };
        if (pWord.direction === 'across') clues.across.push(clue); else clues.down.push(clue);
        
        const r = pWord.row - minRow;
        const c = pWord.col - minCol;
        if (trimmedGrid[r]?.[c]) trimmedGrid[r][c].number = number;
    });

    clues.across.sort((a,b) => a.number - b.number);
    clues.down.sort((a,b) => a.number - b.number);
    return clues;
  }
}
