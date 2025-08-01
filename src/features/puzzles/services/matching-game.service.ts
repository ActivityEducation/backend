import { Injectable as InjectableMatchingGame } from '@nestjs/common';
import { VocabularyItemDto as MatchingGameVocabularyItem } from '../dto/vocabulary-item.dto';

// Re-using the shuffle helper
const shuffleMatching = (array) => array.sort(() => Math.random() - 0.5);

@InjectableMatchingGame()
export class MatchingGameService {
  generate(vocabulary: MatchingGameVocabularyItem[]) {
    // The words are returned in order, with their correct definitions for checking answers on the client.
    const words = vocabulary; 
    
    // The definitions are shuffled to create the matching challenge.
    const shuffledDefinitions = shuffleMatching(vocabulary.map(item => item.definition));

    return { words, shuffledDefinitions };
  }
}