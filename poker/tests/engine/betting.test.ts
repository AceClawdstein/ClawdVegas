import { describe, it, expect } from 'vitest';
import {
  createBettingState,
  createBettingStateWithBlinds,
  getValidActions,
  validateAction,
  applyAction,
  isBettingRoundComplete,
  type BettingPlayer,
  type BettingState,
} from '../../src/engine/betting.js';

describe('Betting', () => {
  const bigBlind = 100n;

  describe('createBettingState', () => {
    it('should create initial state with no bets', () => {
      const state = createBettingState(bigBlind);
      expect(state.currentBet).toBe(0n);
      expect(state.minRaise).toBe(bigBlind);
    });

    it('should create state with blinds posted', () => {
      const state = createBettingStateWithBlinds(bigBlind, 'player1');
      expect(state.currentBet).toBe(bigBlind);
      expect(state.lastRaiser).toBe('player1');
    });
  });

  describe('getValidActions', () => {
    it('should allow check when no bet to call', () => {
      const state = createBettingState(bigBlind);
      const player: BettingPlayer = {
        address: 'player1',
        stack: 1000n,
        currentBet: 0n,
        isFolded: false,
        isAllIn: false,
      };

      const actions = getValidActions(player, state, bigBlind);

      expect(actions.canCheck).toBe(true);
      expect(actions.canCall).toBe(false);
      expect(actions.canBet).toBe(true);
      expect(actions.canRaise).toBe(false);
    });

    it('should require call when there is a bet', () => {
      const state = createBettingStateWithBlinds(bigBlind, 'player2');
      const player: BettingPlayer = {
        address: 'player1',
        stack: 1000n,
        currentBet: 0n,
        isFolded: false,
        isAllIn: false,
      };

      const actions = getValidActions(player, state, bigBlind);

      expect(actions.canCheck).toBe(false);
      expect(actions.canCall).toBe(true);
      expect(actions.callAmount).toBe(bigBlind);
      expect(actions.canBet).toBe(false);
      expect(actions.canRaise).toBe(true);
    });

    it('should allow all-in for short stack', () => {
      const state = createBettingStateWithBlinds(bigBlind, 'player2');
      const player: BettingPlayer = {
        address: 'player1',
        stack: 50n, // Less than BB
        currentBet: 0n,
        isFolded: false,
        isAllIn: false,
      };

      const actions = getValidActions(player, state, bigBlind);

      expect(actions.canCall).toBe(true);
      expect(actions.callAmount).toBe(50n); // All-in call
    });

    it('should calculate min raise correctly', () => {
      const state: BettingState = {
        currentBet: 100n,
        minRaise: 100n,
        lastRaiser: 'player2',
        lastRaiseSize: 100n,
        actedThisRound: new Set(),
        allInPlayers: new Set(),
      };
      const player: BettingPlayer = {
        address: 'player1',
        stack: 1000n,
        currentBet: 0n,
        isFolded: false,
        isAllIn: false,
      };

      const actions = getValidActions(player, state, bigBlind);

      // Min raise should be current bet + last raise size = 200
      expect(actions.minRaise).toBe(200n);
    });
  });

  describe('validateAction', () => {
    it('should validate fold', () => {
      const state = createBettingStateWithBlinds(bigBlind, 'player2');
      const player: BettingPlayer = {
        address: 'player1',
        stack: 1000n,
        currentBet: 0n,
        isFolded: false,
        isAllIn: false,
      };
      const validActions = getValidActions(player, state, bigBlind);

      const result = validateAction({ type: 'fold', amount: 0n }, player, validActions);

      expect(result.valid).toBe(true);
    });

    it('should reject check when bet required', () => {
      const state = createBettingStateWithBlinds(bigBlind, 'player2');
      const player: BettingPlayer = {
        address: 'player1',
        stack: 1000n,
        currentBet: 0n,
        isFolded: false,
        isAllIn: false,
      };
      const validActions = getValidActions(player, state, bigBlind);

      const result = validateAction({ type: 'check', amount: 0n }, player, validActions);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('call');
    });

    it('should validate raise amount', () => {
      const state: BettingState = {
        currentBet: 100n,
        minRaise: 100n,
        lastRaiser: 'player2',
        lastRaiseSize: 100n,
        actedThisRound: new Set(),
        allInPlayers: new Set(),
      };
      const player: BettingPlayer = {
        address: 'player1',
        stack: 1000n,
        currentBet: 0n,
        isFolded: false,
        isAllIn: false,
      };
      const validActions = getValidActions(player, state, bigBlind);

      // Too small raise
      const result = validateAction({ type: 'raise', amount: 150n }, player, validActions);
      expect(result.valid).toBe(false);

      // Valid raise
      const result2 = validateAction({ type: 'raise', amount: 200n }, player, validActions);
      expect(result2.valid).toBe(true);
    });
  });

  describe('applyAction', () => {
    it('should update betting state on raise', () => {
      const state = createBettingStateWithBlinds(bigBlind, 'player2');
      const player: BettingPlayer = {
        address: 'player1',
        stack: 1000n,
        currentBet: 0n,
        isFolded: false,
        isAllIn: false,
      };

      const newState = applyAction({ type: 'raise', amount: 300n }, player, state);

      expect(newState.currentBet).toBe(300n);
      expect(newState.lastRaiser).toBe('player1');
      expect(newState.actedThisRound.has('player1')).toBe(true);
    });

    it('should track all-in players', () => {
      const state = createBettingStateWithBlinds(bigBlind, 'player2');
      const player: BettingPlayer = {
        address: 'player1',
        stack: 150n,
        currentBet: 0n,
        isFolded: false,
        isAllIn: false,
      };

      const newState = applyAction({ type: 'all_in', amount: 150n }, player, state);

      expect(newState.allInPlayers.has('player1')).toBe(true);
    });
  });

  describe('isBettingRoundComplete', () => {
    it('should be complete when all have acted and matched', () => {
      const state: BettingState = {
        currentBet: 100n,
        minRaise: 100n,
        lastRaiser: 'player1',
        lastRaiseSize: 100n,
        actedThisRound: new Set(['player1', 'player2']),
        allInPlayers: new Set(),
      };
      const players: BettingPlayer[] = [
        { address: 'player1', stack: 900n, currentBet: 100n, isFolded: false, isAllIn: false },
        { address: 'player2', stack: 900n, currentBet: 100n, isFolded: false, isAllIn: false },
      ];

      expect(isBettingRoundComplete(players, state)).toBe(true);
    });

    it('should not be complete when someone has not acted', () => {
      const state: BettingState = {
        currentBet: 100n,
        minRaise: 100n,
        lastRaiser: 'player1',
        lastRaiseSize: 100n,
        actedThisRound: new Set(['player1']),
        allInPlayers: new Set(),
      };
      const players: BettingPlayer[] = [
        { address: 'player1', stack: 900n, currentBet: 100n, isFolded: false, isAllIn: false },
        { address: 'player2', stack: 1000n, currentBet: 0n, isFolded: false, isAllIn: false },
      ];

      expect(isBettingRoundComplete(players, state)).toBe(false);
    });

    it('should be complete with one player left after folds', () => {
      const state: BettingState = {
        currentBet: 100n,
        minRaise: 100n,
        lastRaiser: 'player1',
        lastRaiseSize: 100n,
        actedThisRound: new Set(['player1', 'player2']),
        allInPlayers: new Set(),
      };
      const players: BettingPlayer[] = [
        { address: 'player1', stack: 900n, currentBet: 100n, isFolded: false, isAllIn: false },
        { address: 'player2', stack: 1000n, currentBet: 0n, isFolded: true, isAllIn: false },
      ];

      expect(isBettingRoundComplete(players, state)).toBe(true);
    });
  });
});
