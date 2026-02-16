import { describe, it, expect } from 'vitest';
import {
  createBet,
  resolveBet,
  canPlaceBet,
  type ActiveBet,
} from '../../src/engine/bets.js';
import { createInitialState, addPlayer, closeBetting, processRoll } from '../../src/engine/state.js';
import type { DicePair } from '../../src/engine/dice.js';

describe('Bets Module', () => {
  describe('canPlaceBet', () => {
    it('should allow pass_line during come_out_betting', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;

      expect(canPlaceBet(state, 'pass_line')).toBe(true);
    });

    it('should not allow pass_line during point phase', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;
      const roll = processRoll(state, [2, 2] as DicePair); // Point 4
      if (roll.success) state = roll.state;

      expect(canPlaceBet(state, 'pass_line')).toBe(false);
    });

    it('should allow come bet only during point phase', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;

      expect(canPlaceBet(state, 'come')).toBe(false);

      const close = closeBetting(state);
      if (close.success) state = close.state;
      const roll = processRoll(state, [2, 2] as DicePair);
      if (roll.success) state = roll.state;

      expect(canPlaceBet(state, 'come')).toBe(true);
    });

    it('should allow place bets only during point phase', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;

      expect(canPlaceBet(state, 'place_6')).toBe(false);

      const close = closeBetting(state);
      if (close.success) state = close.state;
      const roll = processRoll(state, [2, 2] as DicePair);
      if (roll.success) state = roll.state;

      expect(canPlaceBet(state, 'place_6')).toBe(true);
    });

    it('should allow C&E during any betting phase', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;

      expect(canPlaceBet(state, 'ce_craps')).toBe(true);
      expect(canPlaceBet(state, 'ce_eleven')).toBe(true);
    });
  });

  describe('Pass Line Resolution', () => {
    function makePassBet(): ActiveBet {
      return createBet('0x123', 'pass_line', 100n);
    }

    it('should win on come-out 7', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const bet = makePassBet();
      const dice: DicePair = [3, 4]; // 7
      const result = resolveBet(bet, dice, state);

      expect(result.outcome).toBe('won');
      expect(result.payout).toBe(200n); // 1:1 + original
    });

    it('should win on come-out 11', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const bet = makePassBet();
      const dice: DicePair = [5, 6]; // 11
      const result = resolveBet(bet, dice, state);

      expect(result.outcome).toBe('won');
    });

    it('should lose on come-out 2, 3, 12', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const bet = makePassBet();

      expect(resolveBet(bet, [1, 1] as DicePair, state).outcome).toBe('lost'); // 2
      expect(resolveBet(bet, [1, 2] as DicePair, state).outcome).toBe('lost'); // 3
      expect(resolveBet(bet, [6, 6] as DicePair, state).outcome).toBe('lost'); // 12
    });

    it('should stay active when point established', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const bet = makePassBet();
      const dice: DicePair = [2, 2]; // 4
      const result = resolveBet(bet, dice, state);

      expect(result.outcome).toBe('active');
    });

    it('should win when point is hit', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      // Establish point 4
      const roll = processRoll(state, [2, 2] as DicePair);
      if (roll.success) state = roll.state;
      const close2 = closeBetting(state);
      if (close2.success) state = close2.state;

      const bet = makePassBet();
      const dice: DicePair = [1, 3]; // 4
      const result = resolveBet(bet, dice, state);

      expect(result.outcome).toBe('won');
    });

    it('should lose on seven-out', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      // Establish point
      const roll = processRoll(state, [2, 2] as DicePair);
      if (roll.success) state = roll.state;
      const close2 = closeBetting(state);
      if (close2.success) state = close2.state;

      const bet = makePassBet();
      const dice: DicePair = [3, 4]; // 7
      const result = resolveBet(bet, dice, state);

      expect(result.outcome).toBe('lost');
    });
  });

  describe("Don't Pass Resolution", () => {
    function makeDontPassBet(): ActiveBet {
      return createBet('0x123', 'dont_pass', 100n);
    }

    it('should win on come-out 2 or 3', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const bet = makeDontPassBet();

      expect(resolveBet(bet, [1, 1] as DicePair, state).outcome).toBe('won'); // 2
      expect(resolveBet(bet, [1, 2] as DicePair, state).outcome).toBe('won'); // 3
    });

    it('should push on come-out 12 (bar-12)', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const bet = makeDontPassBet();
      const result = resolveBet(bet, [6, 6] as DicePair, state);

      expect(result.outcome).toBe('pushed');
      expect(result.payout).toBe(100n); // Original returned
    });

    it('should lose on come-out 7 or 11', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const bet = makeDontPassBet();

      expect(resolveBet(bet, [3, 4] as DicePair, state).outcome).toBe('lost'); // 7
      expect(resolveBet(bet, [5, 6] as DicePair, state).outcome).toBe('lost'); // 11
    });

    it('should win on seven-out', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      // Establish point
      const roll = processRoll(state, [2, 2] as DicePair);
      if (roll.success) state = roll.state;
      const close2 = closeBetting(state);
      if (close2.success) state = close2.state;

      const bet = makeDontPassBet();
      const result = resolveBet(bet, [3, 4] as DicePair, state);

      expect(result.outcome).toBe('won');
    });
  });

  describe('Place Bet Resolution', () => {
    it('should win with correct payout for place 6', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;
      const roll = processRoll(state, [2, 2] as DicePair); // Point 4
      if (roll.success) state = roll.state;
      const close2 = closeBetting(state);
      if (close2.success) state = close2.state;

      const bet = createBet('0x123', 'place_6', 60n); // 60 for clean 7:6 payout
      const result = resolveBet(bet, [3, 3] as DicePair, state); // 6

      expect(result.outcome).toBe('won');
      expect(result.payout).toBe(60n + 70n); // 7:6 payout
    });

    it('should lose on seven-out', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;
      const roll = processRoll(state, [2, 2] as DicePair);
      if (roll.success) state = roll.state;
      const close2 = closeBetting(state);
      if (close2.success) state = close2.state;

      const bet = createBet('0x123', 'place_6', 60n);
      const result = resolveBet(bet, [3, 4] as DicePair, state); // 7

      expect(result.outcome).toBe('lost');
    });
  });

  describe('C&E Resolution', () => {
    it('should win ce_craps on 2, 3, 12', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const bet = createBet('0x123', 'ce_craps', 10n);

      const r2 = resolveBet(bet, [1, 1] as DicePair, state);
      expect(r2.outcome).toBe('won');
      expect(r2.payout).toBe(10n + 70n); // 7:1

      const r3 = resolveBet(bet, [1, 2] as DicePair, state);
      expect(r3.outcome).toBe('won');

      const r12 = resolveBet(bet, [6, 6] as DicePair, state);
      expect(r12.outcome).toBe('won');
    });

    it('should win ce_eleven on 11', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const bet = createBet('0x123', 'ce_eleven', 10n);
      const result = resolveBet(bet, [5, 6] as DicePair, state);

      expect(result.outcome).toBe('won');
      expect(result.payout).toBe(10n + 70n); // 7:1
    });

    it('should lose C&E on other numbers (one-roll bet)', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      const crapsBet = createBet('0x123', 'ce_craps', 10n);
      const elevenBet = createBet('0x123', 'ce_eleven', 10n);

      // Both should lose on a 7
      expect(resolveBet(crapsBet, [3, 4] as DicePair, state).outcome).toBe('lost');
      expect(resolveBet(elevenBet, [3, 4] as DicePair, state).outcome).toBe('lost');
    });
  });
});
