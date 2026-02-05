import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  addPlayer,
  removePlayer,
  processRoll,
  passDice,
  canPlaceBets,
  isComingOut,
  closeBetting,
  type GameState,
} from '../../src/engine/state.js';
import type { DicePair } from '../../src/engine/dice.js';

describe('Game State Machine', () => {
  describe('createInitialState', () => {
    it('should create a valid initial state', () => {
      const state = createInitialState();

      expect(state.phase).toBe('waiting_for_shooter');
      expect(state.point).toBeNull();
      expect(state.shooter).toBeNull();
      expect(state.shooterQueue).toEqual([]);
      expect(state.players).toEqual([]);
      expect(state.lastRoll).toBeNull();
      expect(state.rollCount).toBe(0);
    });
  });

  describe('addPlayer', () => {
    it('should add a player to an empty table', () => {
      const state = createInitialState();
      const result = addPlayer(state, '0x123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.players).toHaveLength(1);
        expect(result.state.players[0]?.address).toBe('0x123');
        // First player becomes shooter
        expect(result.state.shooter).toBe('0x123');
        expect(result.state.phase).toBe('come_out_betting');
      }
    });

    it('should add player to shooter queue', () => {
      let state = createInitialState();

      const result1 = addPlayer(state, '0x111');
      expect(result1.success).toBe(true);
      if (result1.success) state = result1.state;

      const result2 = addPlayer(state, '0x222');
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.state.shooterQueue).toContain('0x222');
      }
    });

    it('should reject duplicate players', () => {
      let state = createInitialState();

      const result1 = addPlayer(state, '0x123');
      expect(result1.success).toBe(true);
      if (result1.success) state = result1.state;

      const result2 = addPlayer(state, '0x123');
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error).toContain('already at table');
      }
    });
  });

  describe('removePlayer', () => {
    it('should remove a player from the table', () => {
      let state = createInitialState();

      const addResult = addPlayer(state, '0x123');
      expect(addResult.success).toBe(true);
      if (addResult.success) state = addResult.state;

      // Add second player so we can remove first
      const addResult2 = addPlayer(state, '0x456');
      expect(addResult2.success).toBe(true);
      if (addResult2.success) state = addResult2.state;

      const removeResult = removePlayer(state, '0x456');
      expect(removeResult.success).toBe(true);
      if (removeResult.success) {
        expect(removeResult.state.players).toHaveLength(1);
        expect(removeResult.state.players[0]?.address).toBe('0x123');
      }
    });

    it('should handle shooter leaving mid-game', () => {
      let state = createInitialState();

      const add1 = addPlayer(state, '0xShooter');
      if (add1.success) state = add1.state;

      const add2 = addPlayer(state, '0xNext');
      if (add2.success) state = add2.state;

      expect(state.shooter).toBe('0xShooter');

      const removeResult = removePlayer(state, '0xShooter');
      expect(removeResult.success).toBe(true);
      if (removeResult.success) {
        expect(removeResult.state.shooter).toBe('0xNext');
        expect(removeResult.state.point).toBeNull();
      }
    });

    it('should return to waiting when last player leaves', () => {
      let state = createInitialState();

      const addResult = addPlayer(state, '0x123');
      if (addResult.success) state = addResult.state;

      const removeResult = removePlayer(state, '0x123');
      expect(removeResult.success).toBe(true);
      if (removeResult.success) {
        expect(removeResult.state.phase).toBe('waiting_for_shooter');
        expect(removeResult.state.shooter).toBeNull();
      }
    });

    it('should fail for non-existent player', () => {
      const state = createInitialState();
      const result = removePlayer(state, '0xNotHere');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not at table');
      }
    });
  });

  describe('processRoll - Come Out', () => {
    function setupComeOutState(): GameState {
      let state = createInitialState();
      const add = addPlayer(state, '0xShooter');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;
      return state;
    }

    it('should handle natural 7 on come-out', () => {
      const state = setupComeOutState();
      const dice: DicePair = [3, 4]; // Total: 7

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('come_out_betting');
        expect(result.state.point).toBeNull();
        expect(result.event.type).toBe('natural');
      }
    });

    it('should handle natural 11 on come-out', () => {
      const state = setupComeOutState();
      const dice: DicePair = [5, 6]; // Total: 11

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('natural');
        if (result.event.type === 'natural') {
          expect(result.event.total).toBe(11);
        }
      }
    });

    it('should handle craps 2 on come-out', () => {
      const state = setupComeOutState();
      const dice: DicePair = [1, 1]; // Total: 2

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('come_out_betting');
        expect(result.event.type).toBe('craps');
      }
    });

    it('should handle craps 3 on come-out', () => {
      const state = setupComeOutState();
      const dice: DicePair = [1, 2]; // Total: 3

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('craps');
      }
    });

    it('should handle craps 12 on come-out', () => {
      const state = setupComeOutState();
      const dice: DicePair = [6, 6]; // Total: 12

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('craps');
        if (result.event.type === 'craps') {
          expect(result.event.total).toBe(12);
        }
      }
    });

    it('should establish point on 4', () => {
      const state = setupComeOutState();
      const dice: DicePair = [2, 2]; // Total: 4

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('point_set_betting');
        expect(result.state.point).toBe(4);
        expect(result.event.type).toBe('point_established');
      }
    });

    it('should establish point on 5', () => {
      const state = setupComeOutState();
      const dice: DicePair = [2, 3]; // Total: 5

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.point).toBe(5);
      }
    });

    it('should establish point on 6', () => {
      const state = setupComeOutState();
      const dice: DicePair = [3, 3]; // Total: 6

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.point).toBe(6);
      }
    });

    it('should establish point on 8', () => {
      const state = setupComeOutState();
      const dice: DicePair = [4, 4]; // Total: 8

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.point).toBe(8);
      }
    });

    it('should establish point on 9', () => {
      const state = setupComeOutState();
      const dice: DicePair = [4, 5]; // Total: 9

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.point).toBe(9);
      }
    });

    it('should establish point on 10', () => {
      const state = setupComeOutState();
      const dice: DicePair = [5, 5]; // Total: 10

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.point).toBe(10);
      }
    });
  });

  describe('processRoll - Point Phase', () => {
    function setupPointState(point: number): GameState {
      let state = createInitialState();
      const add = addPlayer(state, '0xShooter');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      // Set up a specific point
      let dice: DicePair;
      switch (point) {
        case 4: dice = [2, 2]; break;
        case 5: dice = [2, 3]; break;
        case 6: dice = [3, 3]; break;
        case 8: dice = [4, 4]; break;
        case 9: dice = [4, 5]; break;
        case 10: dice = [5, 5]; break;
        default: dice = [2, 2];
      }

      const pointRoll = processRoll(state, dice);
      if (pointRoll.success) state = pointRoll.state;

      // Close betting for point roll
      const close2 = closeBetting(state);
      if (close2.success) state = close2.state;

      return state;
    }

    it('should handle point hit', () => {
      const state = setupPointState(6);
      expect(state.point).toBe(6);

      const dice: DicePair = [3, 3]; // Total: 6
      const result = processRoll(state, dice);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('come_out_betting');
        expect(result.state.point).toBeNull();
        expect(result.event.type).toBe('point_hit');
      }
    });

    it('should handle seven-out', () => {
      let state = createInitialState();
      const add1 = addPlayer(state, '0xShooter1');
      if (add1.success) state = add1.state;
      const add2 = addPlayer(state, '0xShooter2');
      if (add2.success) state = add2.state;

      // Close betting and establish point
      const close = closeBetting(state);
      if (close.success) state = close.state;
      const pointRoll = processRoll(state, [2, 2] as DicePair); // Point 4
      if (pointRoll.success) state = pointRoll.state;
      const close2 = closeBetting(state);
      if (close2.success) state = close2.state;

      // Seven-out
      const dice: DicePair = [3, 4]; // Total: 7
      const result = processRoll(state, dice);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('seven_out');
        expect(result.state.point).toBeNull();
        // Shooter should rotate
        expect(result.state.shooter).toBe('0xShooter2');
      }
    });

    it('should continue on non-point, non-seven roll', () => {
      const state = setupPointState(4);
      const dice: DicePair = [4, 4]; // Total: 8 (not 4, not 7)

      const result = processRoll(state, dice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.phase).toBe('point_set_betting');
        expect(result.state.point).toBe(4); // Point unchanged
        expect(result.event.type).toBe('dice_rolled');
      }
    });
  });

  describe('passDice', () => {
    it('should allow shooter to pass dice voluntarily', () => {
      let state = createInitialState();
      const add1 = addPlayer(state, '0xShooter1');
      if (add1.success) state = add1.state;
      const add2 = addPlayer(state, '0xShooter2');
      if (add2.success) state = add2.state;

      const result = passDice(state, '0xShooter1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.state.shooter).toBe('0xShooter2');
        expect(result.event.type).toBe('shooter_changed');
      }
    });

    it('should reject non-shooter trying to pass', () => {
      let state = createInitialState();
      const add1 = addPlayer(state, '0xShooter1');
      if (add1.success) state = add1.state;
      const add2 = addPlayer(state, '0xShooter2');
      if (add2.success) state = add2.state;

      const result = passDice(state, '0xShooter2'); // Not the shooter
      expect(result.success).toBe(false);
    });
  });

  describe('canPlaceBets', () => {
    it('should return true during betting phases', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;

      expect(canPlaceBets(state)).toBe(true); // come_out_betting

      // Establish point
      const close = closeBetting(state);
      if (close.success) state = close.state;
      const roll = processRoll(state, [2, 2] as DicePair);
      if (roll.success) state = roll.state;

      expect(canPlaceBets(state)).toBe(true); // point_set_betting
    });

    it('should return false during roll phases', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;

      expect(canPlaceBets(state)).toBe(false); // come_out_roll
    });
  });

  describe('isComingOut', () => {
    it('should return true during come-out phases', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;

      expect(isComingOut(state)).toBe(true); // come_out_betting

      const close = closeBetting(state);
      if (close.success) state = close.state;

      expect(isComingOut(state)).toBe(true); // come_out_roll
    });

    it('should return false during point phases', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;
      const close = closeBetting(state);
      if (close.success) state = close.state;
      const roll = processRoll(state, [2, 2] as DicePair);
      if (roll.success) state = roll.state;

      expect(isComingOut(state)).toBe(false); // point_set_betting
    });
  });

  describe('roll count', () => {
    it('should increment roll count', () => {
      let state = createInitialState();
      const add = addPlayer(state, '0x123');
      if (add.success) state = add.state;

      expect(state.rollCount).toBe(0);

      const close = closeBetting(state);
      if (close.success) state = close.state;

      const roll1 = processRoll(state, [2, 2] as DicePair);
      if (roll1.success) state = roll1.state;
      expect(state.rollCount).toBe(1);

      const close2 = closeBetting(state);
      if (close2.success) state = close2.state;

      const roll2 = processRoll(state, [3, 3] as DicePair);
      if (roll2.success) state = roll2.state;
      expect(state.rollCount).toBe(2);
    });
  });
});
