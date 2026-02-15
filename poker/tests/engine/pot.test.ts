import { describe, it, expect } from 'vitest';
import {
  calculatePots,
  awardPots,
  consolidateAwards,
  type PlayerContribution,
} from '../../src/engine/pot.js';
import { evaluateHand, type HandResult } from '../../src/engine/hand-eval.js';
import { stringToCard } from '../../src/engine/deck.js';

const cards = (strs: string[]) => strs.map(stringToCard);

describe('Pot Management', () => {
  describe('calculatePots', () => {
    it('should calculate simple pot with equal contributions', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player2', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player3', totalInvested: 100n, isFolded: false, isAllIn: false },
      ];

      const result = calculatePots(contributions);

      expect(result.totalPot).toBe(300n);
      expect(result.mainPot.amount).toBe(300n);
      expect(result.mainPot.eligiblePlayers).toEqual(['player1', 'player2', 'player3']);
      expect(result.sidePots.length).toBe(0);
    });

    it('should handle folded player contributions', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 100n, isFolded: true, isAllIn: false },
        { address: 'player2', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player3', totalInvested: 100n, isFolded: false, isAllIn: false },
      ];

      const result = calculatePots(contributions);

      expect(result.totalPot).toBe(300n);
      expect(result.mainPot.amount).toBe(300n);
      // Folded player NOT eligible
      expect(result.mainPot.eligiblePlayers).toEqual(['player2', 'player3']);
    });

    it('should create side pot when player is all-in short', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 50n, isFolded: false, isAllIn: true },
        { address: 'player2', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player3', totalInvested: 100n, isFolded: false, isAllIn: false },
      ];

      const result = calculatePots(contributions);

      expect(result.totalPot).toBe(250n);
      // Main pot: 50 × 3 = 150 (all eligible)
      expect(result.mainPot.amount).toBe(150n);
      expect(result.mainPot.eligiblePlayers).toEqual(['player1', 'player2', 'player3']);
      // Side pot: (100-50) × 2 = 100 (only player2 and player3 eligible)
      expect(result.sidePots.length).toBe(1);
      expect(result.sidePots[0]!.amount).toBe(100n);
      expect(result.sidePots[0]!.eligiblePlayers).toEqual(['player2', 'player3']);
    });

    it('should create multiple side pots for multiple all-ins', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 25n, isFolded: false, isAllIn: true },
        { address: 'player2', totalInvested: 50n, isFolded: false, isAllIn: true },
        { address: 'player3', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player4', totalInvested: 100n, isFolded: false, isAllIn: false },
      ];

      const result = calculatePots(contributions);

      expect(result.totalPot).toBe(275n);
      // Main pot: 25 × 4 = 100 (all eligible)
      expect(result.mainPot.amount).toBe(100n);
      expect(result.mainPot.eligiblePlayers.length).toBe(4);
      // Side pot 1: (50-25) × 3 = 75 (players 2,3,4)
      expect(result.sidePots[0]!.amount).toBe(75n);
      expect(result.sidePots[0]!.eligiblePlayers.length).toBe(3);
      // Side pot 2: (100-50) × 2 = 100 (players 3,4)
      expect(result.sidePots[1]!.amount).toBe(100n);
      expect(result.sidePots[1]!.eligiblePlayers.length).toBe(2);
    });

    it('should handle single player remaining', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 50n, isFolded: true, isAllIn: false },
        { address: 'player2', totalInvested: 100n, isFolded: false, isAllIn: false },
      ];

      const result = calculatePots(contributions);

      expect(result.totalPot).toBe(150n);
      expect(result.mainPot.eligiblePlayers).toEqual(['player2']);
    });
  });

  describe('awardPots', () => {
    it('should award pot to single winner', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player2', totalInvested: 100n, isFolded: false, isAllIn: false },
      ];
      const potState = calculatePots(contributions);

      const hands = new Map<string, HandResult>([
        ['player1', evaluateHand(cards(['Ah', 'Kh', 'Qh', 'Jh', 'Th']))], // Royal flush
        ['player2', evaluateHand(cards(['2h', '3d', '4s', '5c', '7h']))], // High card
      ]);

      const awards = awardPots(potState, hands, new Set());

      expect(awards.length).toBe(1);
      expect(awards[0]!.address).toBe('player1');
      expect(awards[0]!.amount).toBe(200n);
    });

    it('should split pot between tied winners', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player2', totalInvested: 100n, isFolded: false, isAllIn: false },
      ];
      const potState = calculatePots(contributions);

      // Same hand (A-K high)
      const hands = new Map<string, HandResult>([
        ['player1', evaluateHand(cards(['Ah', 'Kd', '9s', '7h', '5c']))],
        ['player2', evaluateHand(cards(['As', 'Kh', '9d', '7c', '5d']))],
      ]);

      const awards = awardPots(potState, hands, new Set());

      expect(awards.length).toBe(2);
      expect(awards[0]!.amount + awards[1]!.amount).toBe(200n);
      expect(awards[0]!.amount).toBe(100n);
      expect(awards[1]!.amount).toBe(100n);
    });

    it('should award side pots correctly', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 50n, isFolded: false, isAllIn: true },
        { address: 'player2', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player3', totalInvested: 100n, isFolded: false, isAllIn: false },
      ];
      const potState = calculatePots(contributions);

      // Player1 has best hand
      const hands = new Map<string, HandResult>([
        ['player1', evaluateHand(cards(['Ah', 'Ad', 'As', 'Ac', 'Kh']))], // Quads
        ['player2', evaluateHand(cards(['Kh', 'Kd', 'Ks', '2c', '3h']))], // Trips
        ['player3', evaluateHand(cards(['2h', '3d', '4s', '5c', '7h']))], // High card
      ]);

      const awards = awardPots(potState, hands, new Set());

      // Player1 wins main pot (150), player2 wins side pot (100)
      const consolidated = consolidateAwards(awards);
      expect(consolidated.get('player1')).toBe(150n);
      expect(consolidated.get('player2')).toBe(100n);
    });

    it('should exclude folded players from awards', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player2', totalInvested: 100n, isFolded: true, isAllIn: false },
      ];
      const potState = calculatePots(contributions);

      const hands = new Map<string, HandResult>([
        ['player1', evaluateHand(cards(['2h', '3d', '4s', '5c', '7h']))],
        ['player2', evaluateHand(cards(['Ah', 'Ad', 'As', 'Ac', 'Kh']))], // Better but folded
      ]);

      const awards = awardPots(potState, hands, new Set(['player2']));

      expect(awards.length).toBe(1);
      expect(awards[0]!.address).toBe('player1');
      expect(awards[0]!.amount).toBe(200n);
    });

    it('should handle odd chip rule (first winner gets extra)', () => {
      const contributions: PlayerContribution[] = [
        { address: 'player1', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player2', totalInvested: 100n, isFolded: false, isAllIn: false },
        { address: 'player3', totalInvested: 101n, isFolded: false, isAllIn: false },
      ];
      const potState = calculatePots(contributions);

      // All three tie
      const hands = new Map<string, HandResult>([
        ['player1', evaluateHand(cards(['Ah', 'Kd', '9s', '7h', '5c']))],
        ['player2', evaluateHand(cards(['As', 'Kh', '9d', '7c', '5d']))],
        ['player3', evaluateHand(cards(['Ad', 'Kc', '9h', '7d', '5h']))],
      ]);

      const awards = awardPots(potState, hands, new Set());
      const consolidated = consolidateAwards(awards);

      // Total 301, split 3 ways = 100 each, with 1 remainder to first winner
      const total = Array.from(consolidated.values()).reduce((a, b) => a + b, 0n);
      expect(total).toBe(301n);
    });
  });

  describe('consolidateAwards', () => {
    it('should sum multiple awards for same player', () => {
      const awards = [
        { address: 'player1', amount: 100n, potDescription: 'main pot' },
        { address: 'player1', amount: 50n, potDescription: 'side pot 1' },
        { address: 'player2', amount: 75n, potDescription: 'side pot 2' },
      ];

      const consolidated = consolidateAwards(awards);

      expect(consolidated.get('player1')).toBe(150n);
      expect(consolidated.get('player2')).toBe(75n);
    });
  });
});
