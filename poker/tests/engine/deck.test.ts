import { describe, it, expect } from 'vitest';
import {
  createDeck,
  shuffleDeck,
  dealCards,
  dealHoleCards,
  cardToString,
  stringToCard,
  cardName,
  cardDisplay,
  sortByRank,
  sameSuit,
  RANKS,
  SUITS,
} from '../../src/engine/deck.js';

describe('Deck', () => {
  describe('createDeck', () => {
    it('should create 52 cards', () => {
      const deck = createDeck();
      expect(deck.length).toBe(52);
    });

    it('should have 13 cards of each suit', () => {
      const deck = createDeck();
      for (const suit of SUITS) {
        const suited = deck.filter(c => c.suit === suit);
        expect(suited.length).toBe(13);
      }
    });

    it('should have 4 cards of each rank', () => {
      const deck = createDeck();
      for (const rank of RANKS) {
        const ranked = deck.filter(c => c.rank === rank);
        expect(ranked.length).toBe(4);
      }
    });

    it('should have all unique cards', () => {
      const deck = createDeck();
      const strings = deck.map(cardToString);
      const unique = new Set(strings);
      expect(unique.size).toBe(52);
    });
  });

  describe('shuffleDeck', () => {
    it('should return 52 cards', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);
      expect(shuffled.length).toBe(52);
    });

    it('should not mutate original deck', () => {
      const deck = createDeck();
      const original = [...deck];
      shuffleDeck(deck);
      expect(deck).toEqual(original);
    });

    it('should contain all original cards', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);
      const origSet = new Set(deck.map(cardToString));
      const shuffSet = new Set(shuffled.map(cardToString));
      expect(shuffSet).toEqual(origSet);
    });

    it('should produce different orderings (statistical)', () => {
      const deck = createDeck();
      const results = new Set<string>();

      // Shuffle 10 times, expect at least 9 unique orderings
      for (let i = 0; i < 10; i++) {
        const shuffled = shuffleDeck(deck);
        results.add(shuffled.map(cardToString).join(','));
      }

      expect(results.size).toBeGreaterThanOrEqual(9);
    });
  });

  describe('dealCards', () => {
    it('should deal requested number of cards', () => {
      const deck = createDeck();
      const { dealt, remaining } = dealCards(deck, 5);
      expect(dealt.length).toBe(5);
      expect(remaining.length).toBe(47);
    });

    it('should deal from top of deck', () => {
      const deck = createDeck();
      const { dealt } = dealCards(deck, 3);
      expect(dealt[0]).toEqual(deck[0]);
      expect(dealt[1]).toEqual(deck[1]);
      expect(dealt[2]).toEqual(deck[2]);
    });

    it('should throw if not enough cards', () => {
      const deck = createDeck();
      expect(() => dealCards(deck, 53)).toThrow();
    });
  });

  describe('dealHoleCards', () => {
    it('should deal 2 cards to each player', () => {
      const deck = shuffleDeck(createDeck());
      const { hands, remaining } = dealHoleCards(deck, 6);

      expect(hands.length).toBe(6);
      for (const hand of hands) {
        expect(hand.length).toBe(2);
      }
      expect(remaining.length).toBe(40); // 52 - 12
    });

    it('should deal one at a time (round-robin)', () => {
      const deck = createDeck(); // Ordered deck for predictability
      const { hands } = dealHoleCards(deck, 3);

      // First round: cards 0, 1, 2 go to players 0, 1, 2
      // Second round: cards 3, 4, 5 go to players 0, 1, 2
      expect(hands[0]![0]).toEqual(deck[0]);
      expect(hands[1]![0]).toEqual(deck[1]);
      expect(hands[2]![0]).toEqual(deck[2]);
      expect(hands[0]![1]).toEqual(deck[3]);
      expect(hands[1]![1]).toEqual(deck[4]);
      expect(hands[2]![1]).toEqual(deck[5]);
    });
  });

  describe('cardToString / stringToCard', () => {
    it('should convert card to string', () => {
      expect(cardToString({ rank: 'A', suit: 'h' })).toBe('Ah');
      expect(cardToString({ rank: 'T', suit: 's' })).toBe('Ts');
      expect(cardToString({ rank: '2', suit: 'd' })).toBe('2d');
    });

    it('should parse string to card', () => {
      expect(stringToCard('Ah')).toEqual({ rank: 'A', suit: 'h' });
      expect(stringToCard('Ts')).toEqual({ rank: 'T', suit: 's' });
      expect(stringToCard('2d')).toEqual({ rank: '2', suit: 'd' });
    });

    it('should throw on invalid string', () => {
      expect(() => stringToCard('X')).toThrow();
      expect(() => stringToCard('Ax')).toThrow();
      expect(() => stringToCard('1h')).toThrow();
    });

    it('should round-trip all cards', () => {
      const deck = createDeck();
      for (const card of deck) {
        const str = cardToString(card);
        const parsed = stringToCard(str);
        expect(parsed).toEqual(card);
      }
    });
  });

  describe('cardName / cardDisplay', () => {
    it('should return human-readable name', () => {
      expect(cardName({ rank: 'A', suit: 'h' })).toBe('Ace of Hearts');
      expect(cardName({ rank: 'K', suit: 's' })).toBe('King of Spades');
      expect(cardName({ rank: '7', suit: 'd' })).toBe('Seven of Diamonds');
    });

    it('should return display with symbol', () => {
      expect(cardDisplay({ rank: 'A', suit: 'h' })).toBe('A♥');
      expect(cardDisplay({ rank: 'K', suit: 's' })).toBe('K♠');
      expect(cardDisplay({ rank: '7', suit: 'd' })).toBe('7♦');
    });
  });

  describe('sortByRank', () => {
    it('should sort cards highest first', () => {
      const cards = [
        { rank: '2' as const, suit: 'h' as const },
        { rank: 'A' as const, suit: 's' as const },
        { rank: '7' as const, suit: 'd' as const },
        { rank: 'K' as const, suit: 'c' as const },
      ];
      const sorted = sortByRank(cards);
      expect(sorted.map(c => c.rank)).toEqual(['A', 'K', '7', '2']);
    });

    it('should not mutate original array', () => {
      const cards = [
        { rank: '2' as const, suit: 'h' as const },
        { rank: 'A' as const, suit: 's' as const },
      ];
      const original = [...cards];
      sortByRank(cards);
      expect(cards).toEqual(original);
    });
  });

  describe('sameSuit', () => {
    it('should return true for same suit', () => {
      const cards = [
        { rank: 'A' as const, suit: 'h' as const },
        { rank: 'K' as const, suit: 'h' as const },
        { rank: '7' as const, suit: 'h' as const },
      ];
      expect(sameSuit(cards)).toBe(true);
    });

    it('should return false for different suits', () => {
      const cards = [
        { rank: 'A' as const, suit: 'h' as const },
        { rank: 'K' as const, suit: 's' as const },
      ];
      expect(sameSuit(cards)).toBe(false);
    });

    it('should return true for empty array', () => {
      expect(sameSuit([])).toBe(true);
    });
  });
});
