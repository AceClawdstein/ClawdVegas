import { describe, it, expect } from 'vitest';
import {
  rollDice,
  getTotal,
  isHardway,
  isNatural,
  isCraps,
  isPoint,
  isPointNumber,
  POINT_NUMBERS,
  type DicePair,
} from '../../src/engine/dice.js';

describe('Dice Module', () => {
  describe('rollDice', () => {
    it('should return an array of two numbers', () => {
      const result = rollDice();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('should return values between 1 and 6 inclusive', () => {
      // Roll many times to increase confidence
      for (let i = 0; i < 100; i++) {
        const [die1, die2] = rollDice();
        expect(die1).toBeGreaterThanOrEqual(1);
        expect(die1).toBeLessThanOrEqual(6);
        expect(die2).toBeGreaterThanOrEqual(1);
        expect(die2).toBeLessThanOrEqual(6);
      }
    });

    it('should produce varying results (not deterministic)', () => {
      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const dice = rollDice();
        results.add(`${dice[0]},${dice[1]}`);
      }
      // Should have multiple different results
      expect(results.size).toBeGreaterThan(5);
    });
  });

  describe('getTotal', () => {
    it('should return correct sum for various dice pairs', () => {
      expect(getTotal([1, 1])).toBe(2);
      expect(getTotal([6, 6])).toBe(12);
      expect(getTotal([3, 4])).toBe(7);
      expect(getTotal([5, 6])).toBe(11);
      expect(getTotal([2, 3])).toBe(5);
    });

    it('should handle minimum and maximum totals', () => {
      expect(getTotal([1, 1])).toBe(2); // minimum
      expect(getTotal([6, 6])).toBe(12); // maximum
    });
  });

  describe('isHardway', () => {
    it('should return true for doubles', () => {
      expect(isHardway([1, 1])).toBe(true);
      expect(isHardway([2, 2])).toBe(true);
      expect(isHardway([3, 3])).toBe(true);
      expect(isHardway([4, 4])).toBe(true);
      expect(isHardway([5, 5])).toBe(true);
      expect(isHardway([6, 6])).toBe(true);
    });

    it('should return false for non-doubles', () => {
      expect(isHardway([1, 2])).toBe(false);
      expect(isHardway([3, 4])).toBe(false);
      expect(isHardway([5, 6])).toBe(false);
      expect(isHardway([2, 5])).toBe(false);
    });
  });

  describe('isNatural', () => {
    it('should return true for 7', () => {
      expect(isNatural([1, 6])).toBe(true);
      expect(isNatural([2, 5])).toBe(true);
      expect(isNatural([3, 4])).toBe(true);
      expect(isNatural([4, 3])).toBe(true);
      expect(isNatural([5, 2])).toBe(true);
      expect(isNatural([6, 1])).toBe(true);
    });

    it('should return true for 11', () => {
      expect(isNatural([5, 6])).toBe(true);
      expect(isNatural([6, 5])).toBe(true);
    });

    it('should return false for other totals', () => {
      expect(isNatural([1, 1])).toBe(false); // 2
      expect(isNatural([2, 2])).toBe(false); // 4
      expect(isNatural([3, 3])).toBe(false); // 6
      expect(isNatural([4, 4])).toBe(false); // 8
      expect(isNatural([6, 6])).toBe(false); // 12
    });
  });

  describe('isCraps', () => {
    it('should return true for 2 (snake eyes)', () => {
      expect(isCraps([1, 1])).toBe(true);
    });

    it('should return true for 3', () => {
      expect(isCraps([1, 2])).toBe(true);
      expect(isCraps([2, 1])).toBe(true);
    });

    it('should return true for 12 (boxcars)', () => {
      expect(isCraps([6, 6])).toBe(true);
    });

    it('should return false for other totals', () => {
      expect(isCraps([2, 2])).toBe(false); // 4
      expect(isCraps([3, 4])).toBe(false); // 7
      expect(isCraps([5, 6])).toBe(false); // 11
    });
  });

  describe('isPoint', () => {
    it('should return true for point numbers (4, 5, 6, 8, 9, 10)', () => {
      expect(isPoint([1, 3])).toBe(true); // 4
      expect(isPoint([2, 2])).toBe(true); // 4
      expect(isPoint([2, 3])).toBe(true); // 5
      expect(isPoint([3, 3])).toBe(true); // 6
      expect(isPoint([4, 4])).toBe(true); // 8
      expect(isPoint([4, 5])).toBe(true); // 9
      expect(isPoint([5, 5])).toBe(true); // 10
    });

    it('should return false for non-point numbers (2, 3, 7, 11, 12)', () => {
      expect(isPoint([1, 1])).toBe(false); // 2
      expect(isPoint([1, 2])).toBe(false); // 3
      expect(isPoint([3, 4])).toBe(false); // 7
      expect(isPoint([5, 6])).toBe(false); // 11
      expect(isPoint([6, 6])).toBe(false); // 12
    });
  });

  describe('isPointNumber', () => {
    it('should return true for valid point numbers', () => {
      expect(isPointNumber(4)).toBe(true);
      expect(isPointNumber(5)).toBe(true);
      expect(isPointNumber(6)).toBe(true);
      expect(isPointNumber(8)).toBe(true);
      expect(isPointNumber(9)).toBe(true);
      expect(isPointNumber(10)).toBe(true);
    });

    it('should return false for invalid point numbers', () => {
      expect(isPointNumber(2)).toBe(false);
      expect(isPointNumber(3)).toBe(false);
      expect(isPointNumber(7)).toBe(false);
      expect(isPointNumber(11)).toBe(false);
      expect(isPointNumber(12)).toBe(false);
      expect(isPointNumber(0)).toBe(false);
      expect(isPointNumber(1)).toBe(false);
    });
  });

  describe('POINT_NUMBERS constant', () => {
    it('should contain exactly the point numbers', () => {
      expect(POINT_NUMBERS).toEqual([4, 5, 6, 8, 9, 10]);
    });

    it('should be immutable (readonly)', () => {
      // TypeScript enforces this, but we can verify the values
      expect(POINT_NUMBERS.length).toBe(6);
    });
  });
});
