import { describe, it, expect } from 'vitest';
import {
  evaluateHand,
  compareHands,
  findWinners,
  HandRank,
} from '../../src/engine/hand-eval.js';
import { stringToCard } from '../../src/engine/deck.js';

// Helper to parse card strings
const cards = (strs: string[]) => strs.map(stringToCard);

describe('Hand Evaluation', () => {
  describe('Royal Flush', () => {
    it('should recognize royal flush', () => {
      const hand = cards(['Ah', 'Kh', 'Qh', 'Jh', 'Th']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.StraightFlush);
      expect(result.rankName).toBe('Royal Flush');
    });

    it('should find royal flush from 7 cards', () => {
      const hand = cards(['Ah', 'Kh', 'Qh', 'Jh', 'Th', '2d', '3c']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.StraightFlush);
      expect(result.rankName).toBe('Royal Flush');
    });
  });

  describe('Straight Flush', () => {
    it('should recognize straight flush', () => {
      const hand = cards(['9s', '8s', '7s', '6s', '5s']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.StraightFlush);
      expect(result.rankName).toContain('Straight Flush');
    });

    it('should recognize wheel straight flush (A-2-3-4-5)', () => {
      const hand = cards(['As', '2s', '3s', '4s', '5s']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.StraightFlush);
      expect(result.rankName).toContain('5 high');
    });
  });

  describe('Four of a Kind', () => {
    it('should recognize four of a kind', () => {
      const hand = cards(['Ah', 'Ad', 'As', 'Ac', 'Kh']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.FourOfAKind);
      expect(result.rankName).toBe('Four As');
    });

    it('should compare quads by rank', () => {
      const acesQuads = evaluateHand(cards(['Ah', 'Ad', 'As', 'Ac', '2h']));
      const kingsQuads = evaluateHand(cards(['Kh', 'Kd', 'Ks', 'Kc', 'Ah']));
      expect(compareHands(acesQuads, kingsQuads)).toBeGreaterThan(0);
    });

    it('should compare quads kicker', () => {
      const quadsKingKicker = evaluateHand(cards(['Ah', 'Ad', 'As', 'Ac', 'Kh']));
      const quadsQueenKicker = evaluateHand(cards(['Ah', 'Ad', 'As', 'Ac', 'Qh']));
      expect(compareHands(quadsKingKicker, quadsQueenKicker)).toBeGreaterThan(0);
    });
  });

  describe('Full House', () => {
    it('should recognize full house', () => {
      const hand = cards(['Ah', 'Ad', 'As', 'Kh', 'Kd']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.FullHouse);
      expect(result.rankName).toContain('Full House');
    });

    it('should compare full houses by trips first', () => {
      const acesFullKings = evaluateHand(cards(['Ah', 'Ad', 'As', 'Kh', 'Kd']));
      const kingsFullAces = evaluateHand(cards(['Kh', 'Kd', 'Ks', 'Ah', 'Ad']));
      expect(compareHands(acesFullKings, kingsFullAces)).toBeGreaterThan(0);
    });

    it('should compare full houses by pair when trips equal', () => {
      const acesFullKings = evaluateHand(cards(['Ah', 'Ad', 'As', 'Kh', 'Kd']));
      const acesFullQueens = evaluateHand(cards(['Ah', 'Ad', 'As', 'Qh', 'Qd']));
      expect(compareHands(acesFullKings, acesFullQueens)).toBeGreaterThan(0);
    });
  });

  describe('Flush', () => {
    it('should recognize flush', () => {
      const hand = cards(['Ah', 'Jh', '8h', '5h', '2h']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.Flush);
      expect(result.rankName).toContain('Flush');
    });

    it('should compare flushes by high cards', () => {
      const aceFlush = evaluateHand(cards(['Ah', 'Jh', '8h', '5h', '2h']));
      const kingFlush = evaluateHand(cards(['Kh', 'Jh', '8h', '5h', '2h']));
      expect(compareHands(aceFlush, kingFlush)).toBeGreaterThan(0);
    });

    it('should compare flushes by second card when first equal', () => {
      const flushJ = evaluateHand(cards(['Ah', 'Jh', '8h', '5h', '2h']));
      const flushT = evaluateHand(cards(['Ah', 'Th', '8h', '5h', '2h']));
      expect(compareHands(flushJ, flushT)).toBeGreaterThan(0);
    });
  });

  describe('Straight', () => {
    it('should recognize straight', () => {
      const hand = cards(['Ah', 'Kd', 'Qs', 'Jh', 'Tc']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.Straight);
      expect(result.rankName).toContain('Straight');
    });

    it('should recognize wheel (A-2-3-4-5)', () => {
      const hand = cards(['Ah', '2d', '3s', '4h', '5c']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.Straight);
      expect(result.rankName).toContain('5 high');
    });

    it('should compare straights by high card', () => {
      const broadway = evaluateHand(cards(['Ah', 'Kd', 'Qs', 'Jh', 'Tc']));
      const nineHigh = evaluateHand(cards(['9h', '8d', '7s', '6h', '5c']));
      expect(compareHands(broadway, nineHigh)).toBeGreaterThan(0);
    });

    it('should rank wheel as lowest straight', () => {
      const wheel = evaluateHand(cards(['Ah', '2d', '3s', '4h', '5c']));
      const sixHigh = evaluateHand(cards(['6h', '5d', '4s', '3h', '2c']));
      expect(compareHands(sixHigh, wheel)).toBeGreaterThan(0);
    });
  });

  describe('Three of a Kind', () => {
    it('should recognize three of a kind', () => {
      const hand = cards(['Ah', 'Ad', 'As', 'Kh', 'Qd']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.ThreeOfAKind);
    });

    it('should compare trips by rank then kickers', () => {
      const acesTrips = evaluateHand(cards(['Ah', 'Ad', 'As', 'Kh', 'Qd']));
      const kingsTrips = evaluateHand(cards(['Kh', 'Kd', 'Ks', 'Ah', 'Qd']));
      expect(compareHands(acesTrips, kingsTrips)).toBeGreaterThan(0);
    });
  });

  describe('Two Pair', () => {
    it('should recognize two pair', () => {
      const hand = cards(['Ah', 'Ad', 'Kh', 'Kd', 'Qc']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.TwoPair);
    });

    it('should compare two pair by high pair first', () => {
      const acesAndKings = evaluateHand(cards(['Ah', 'Ad', 'Kh', 'Kd', '2c']));
      const kingsAndQueens = evaluateHand(cards(['Kh', 'Kd', 'Qh', 'Qd', 'Ac']));
      expect(compareHands(acesAndKings, kingsAndQueens)).toBeGreaterThan(0);
    });

    it('should compare two pair by low pair when high pair equal', () => {
      const acesAndKings = evaluateHand(cards(['Ah', 'Ad', 'Kh', 'Kd', '2c']));
      const acesAndQueens = evaluateHand(cards(['Ah', 'Ad', 'Qh', 'Qd', '2c']));
      expect(compareHands(acesAndKings, acesAndQueens)).toBeGreaterThan(0);
    });

    it('should compare two pair kicker when pairs equal', () => {
      const kickerK = evaluateHand(cards(['Ah', 'Ad', 'Qh', 'Qd', 'Kc']));
      const kickerJ = evaluateHand(cards(['Ah', 'Ad', 'Qh', 'Qd', 'Jc']));
      expect(compareHands(kickerK, kickerJ)).toBeGreaterThan(0);
    });
  });

  describe('Pair', () => {
    it('should recognize pair', () => {
      const hand = cards(['Ah', 'Ad', 'Kh', 'Qd', 'Jc']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.Pair);
    });

    it('should compare pairs by rank then kickers', () => {
      const aces = evaluateHand(cards(['Ah', 'Ad', 'Kh', 'Qd', 'Jc']));
      const kings = evaluateHand(cards(['Kh', 'Kd', 'Ah', 'Qd', 'Jc']));
      expect(compareHands(aces, kings)).toBeGreaterThan(0);
    });
  });

  describe('High Card', () => {
    it('should recognize high card', () => {
      const hand = cards(['Ah', 'Kd', 'Qs', '9h', '7c']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.HighCard);
    });

    it('should compare high cards from top down', () => {
      const aceHigh = evaluateHand(cards(['Ah', 'Kd', 'Qs', '9h', '7c']));
      const kingHigh = evaluateHand(cards(['Kd', 'Qh', 'Js', '9h', '7c']));
      expect(compareHands(aceHigh, kingHigh)).toBeGreaterThan(0);
    });
  });

  describe('7-card evaluation', () => {
    it('should find best 5 from 7 cards', () => {
      // Has flush possible but also has full house
      const hand = cards(['Ah', 'Ad', 'As', 'Kh', 'Kd', '2h', '3h']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.FullHouse);
    });

    it('should prefer higher hand rank', () => {
      // Can make flush or straight, should prefer flush
      const hand = cards(['Ah', 'Kh', 'Qh', 'Jh', '9h', 'Td', '8c']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.Flush);
    });

    it('should find straight from 7 cards', () => {
      const hand = cards(['Ah', 'Kd', 'Qs', 'Jh', 'Tc', '2d', '3c']);
      const result = evaluateHand(hand);
      expect(result.rank).toBe(HandRank.Straight);
    });
  });

  describe('findWinners', () => {
    it('should find single winner', () => {
      const hands = [
        evaluateHand(cards(['Ah', 'Ad', '2s', '3h', '4c'])),
        evaluateHand(cards(['Kh', 'Kd', '2s', '3h', '4c'])),
        evaluateHand(cards(['Qh', 'Qd', '2s', '3h', '4c'])),
      ];
      const winners = findWinners(hands);
      expect(winners).toEqual([0]);
    });

    it('should find multiple winners (split pot)', () => {
      // Two players with same A-K high, one with pair of queens
      const hands = [
        evaluateHand(cards(['Ah', 'Kd', '9s', '7h', '5c'])),  // A-K high
        evaluateHand(cards(['As', 'Kh', '9d', '7c', '5d'])),  // A-K high (same)
        evaluateHand(cards(['Qh', 'Qd', '9h', '7d', '5h'])),  // Pair of Q (beats high card)
      ];
      const winners = findWinners(hands);
      expect(winners).toEqual([2]); // Pair wins
    });

    it('should split when hands are equal', () => {
      // Same hand ranking, same kickers = split
      const hands = [
        evaluateHand(cards(['Ah', 'Kd', '9s', '7h', '5c'])),
        evaluateHand(cards(['As', 'Kh', '9d', '7c', '5d'])),
      ];
      const winners = findWinners(hands);
      expect(winners).toEqual([0, 1]);
    });

    it('should handle empty array', () => {
      const winners = findWinners([]);
      expect(winners).toEqual([]);
    });
  });

  describe('Hand ranking order', () => {
    it('should rank hands correctly', () => {
      const highCard = evaluateHand(cards(['Ah', 'Kd', 'Qs', '9h', '7c']));
      const pair = evaluateHand(cards(['Ah', 'Ad', 'Ks', '9h', '7c']));
      const twoPair = evaluateHand(cards(['Ah', 'Ad', 'Ks', 'Kh', '7c']));
      const trips = evaluateHand(cards(['Ah', 'Ad', 'As', 'Kh', '7c']));
      const straight = evaluateHand(cards(['Ah', 'Kd', 'Qs', 'Jh', 'Tc']));
      const flush = evaluateHand(cards(['Ah', 'Kh', 'Qh', '9h', '7h']));
      const fullHouse = evaluateHand(cards(['Ah', 'Ad', 'As', 'Kh', 'Kd']));
      const quads = evaluateHand(cards(['Ah', 'Ad', 'As', 'Ac', 'Kh']));
      const straightFlush = evaluateHand(cards(['9h', '8h', '7h', '6h', '5h']));

      expect(pair.score).toBeGreaterThan(highCard.score);
      expect(twoPair.score).toBeGreaterThan(pair.score);
      expect(trips.score).toBeGreaterThan(twoPair.score);
      expect(straight.score).toBeGreaterThan(trips.score);
      expect(flush.score).toBeGreaterThan(straight.score);
      expect(fullHouse.score).toBeGreaterThan(flush.score);
      expect(quads.score).toBeGreaterThan(fullHouse.score);
      expect(straightFlush.score).toBeGreaterThan(quads.score);
    });
  });
});
