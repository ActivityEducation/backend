import { Injectable as InjectableAnagrams } from '@nestjs/common';
import { VocabularyItemDto as AnagramsVocabularyItem } from '../dto/vocabulary-item.dto';

const shuffleWord = (word: string): string => {
  const letters = word.split('');
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const shuffled = letters.join('');
  if (shuffled === word && word.length > 1) {
    return shuffleWord(word); // Reshuffle if it's the same
  }
  return shuffled;
};

@InjectableAnagrams()
export class AnagramsService {
  generate(vocabulary: AnagramsVocabularyItem[]) {
    return vocabulary.map(item => ({
      scrambledWord: shuffleWord(item.word.toUpperCase().replace(/\s/g, '')),
      definition: item.definition,
      originalWord: item.word, 
    }));
  }
}