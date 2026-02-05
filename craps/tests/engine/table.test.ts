import { describe, it, expect, vi } from 'vitest';
import { createTable, type CrapsTable } from '../../src/engine/table.js';

describe('CrapsTable', () => {
  describe('join', () => {
    it('should allow player to join empty table', () => {
      const table = createTable();
      const result = table.join('0x123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.position).toBe(0);
      }
    });

    it('should make first player the shooter', () => {
      const table = createTable();
      table.join('0x123');

      const state = table.getState();
      expect(state.shooter).toBe('0x123');
      expect(state.phase).toBe('come_out_betting');
    });

    it('should reject duplicate player', () => {
      const table = createTable();
      table.join('0x123');
      const result = table.join('0x123');

      expect(result.success).toBe(false);
    });

    it('should enforce max players', () => {
      const table = createTable({ maxPlayers: 2 });
      table.join('0x111');
      table.join('0x222');
      const result = table.join('0x333');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('full');
      }
    });
  });

  describe('leave', () => {
    it('should allow player to leave', () => {
      const table = createTable();
      table.join('0x123');
      table.join('0x456');

      const result = table.leave('0x456');
      expect(result.success).toBe(true);
      expect(table.getState().players).toHaveLength(1);
    });

    it('should refund active bets when leaving', () => {
      const table = createTable();
      table.join('0x123');
      table.join('0x456'); // Second player so first can leave
      table.placeBet('0x123', 'pass_line', 50000n); // Use valid bet amount

      const result = table.leave('0x123');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.refundedBets).toHaveLength(1);
        expect(result.data.refundedBets[0]?.amount).toBe(50000n);
      }
    });
  });

  describe('placeBet', () => {
    it('should allow valid pass_line bet', () => {
      const table = createTable();
      table.join('0x123');

      const result = table.placeBet('0x123', 'pass_line', 50000n);
      expect(result.success).toBe(true);
    });

    it('should reject bet below minimum', () => {
      const table = createTable({ minBet: 10000n });
      table.join('0x123');

      const result = table.placeBet('0x123', 'pass_line', 100n);
      expect(result.success).toBe(false);
    });

    it('should reject bet above maximum', () => {
      const table = createTable({ maxBet: 100000n });
      table.join('0x123');

      const result = table.placeBet('0x123', 'pass_line', 1000000n);
      expect(result.success).toBe(false);
    });

    it('should reject bet from non-player', () => {
      const table = createTable();
      table.join('0x123');

      const result = table.placeBet('0xNotAtTable', 'pass_line', 50000n);
      expect(result.success).toBe(false);
    });

    it('should reject invalid bet type for phase', () => {
      const table = createTable();
      table.join('0x123');

      // Come bet not allowed during come-out
      const result = table.placeBet('0x123', 'come', 50000n);
      expect(result.success).toBe(false);
    });
  });

  describe('roll', () => {
    it('should reject roll from non-shooter', () => {
      const table = createTable();
      table.join('0xShooter');
      table.join('0xNotShooter');

      const result = table.roll('0xNotShooter');
      expect(result.success).toBe(false);
    });

    it('should process roll and resolve bets', () => {
      const table = createTable();
      table.join('0x123');
      table.placeBet('0x123', 'pass_line', 50000n);

      const result = table.roll('0x123');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dice).toHaveLength(2);
        expect(result.data.resolutions.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should emit events on roll', () => {
      const table = createTable();
      const diceRolled = vi.fn();
      table.on('dice_rolled', diceRolled);

      table.join('0x123');
      table.roll('0x123');

      expect(diceRolled).toHaveBeenCalled();
    });
  });

  describe('getPlayerBets', () => {
    it('should return only specified player bets', () => {
      const table = createTable();
      table.join('0x111');
      table.join('0x222');

      table.placeBet('0x111', 'pass_line', 50000n);
      table.placeBet('0x222', 'pass_line', 60000n);

      const player1Bets = table.getPlayerBets('0x111');
      expect(player1Bets).toHaveLength(1);
      expect(player1Bets[0]?.amount).toBe(50000n);
    });
  });

  describe('full game flow', () => {
    it('should handle complete game cycle', () => {
      const table = createTable();

      // Two players join
      table.join('0xShooter');
      table.join('0xPlayer2');

      // Both place pass line bets
      table.placeBet('0xShooter', 'pass_line', 50000n);
      table.placeBet('0xPlayer2', 'pass_line', 50000n);

      // Shooter rolls
      const rollResult = table.roll('0xShooter');
      expect(rollResult.success).toBe(true);

      // State should be updated
      const state = table.getState();
      expect(state.lastRoll).not.toBeNull();
    });
  });

  describe('events', () => {
    it('should emit player_joined event', () => {
      const table = createTable();
      const handler = vi.fn();
      table.on('player_joined', handler);

      table.join('0x123');

      expect(handler).toHaveBeenCalledWith({
        address: '0x123',
        playerCount: 1,
      });
    });

    it('should emit bet_placed event', () => {
      const table = createTable();
      const handler = vi.fn();
      table.on('bet_placed', handler);

      table.join('0x123');
      table.placeBet('0x123', 'pass_line', 50000n);

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].betTypeName).toBe('Pass Line');
    });

    it('should emit ace_says event with commentary', () => {
      const table = createTable();
      const handler = vi.fn();
      table.on('ace_says', handler);

      table.join('0x123');

      expect(handler).toHaveBeenCalled();
      expect(typeof handler.mock.calls[0][0].message).toBe('string');
    });
  });
});
