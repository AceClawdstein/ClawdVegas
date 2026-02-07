import { describe, it, expect, beforeEach } from 'vitest';
import { ChipLedger } from '../../src/ledger/chip-ledger.js';

const HOUSE = '0xHOUSE';
const PLAYER_A = '0xAAAA';
const PLAYER_B = '0xBBBB';

describe('ChipLedger', () => {
  let ledger: ChipLedger;

  beforeEach(() => {
    ledger = new ChipLedger({ houseWallet: HOUSE });
  });

  describe('deposits', () => {
    it('should credit chips on confirmed deposit', () => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
      expect(ledger.getBalance(PLAYER_A)).toBe(1000000n);
    });

    it('should accumulate multiple deposits', () => {
      ledger.confirmDeposit(PLAYER_A, 500000n, '0xTX1');
      ledger.confirmDeposit(PLAYER_A, 300000n, '0xTX2');
      expect(ledger.getBalance(PLAYER_A)).toBe(800000n);
    });

    it('should reject deposits below minimum', () => {
      expect(() => ledger.confirmDeposit(PLAYER_A, 5000n, '0xTX1')).toThrow();
    });

    it('should track total deposited', () => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
      const bal = ledger.getPlayerBalance(PLAYER_A);
      expect(bal.totalDeposited).toBe(1000000n);
    });
  });

  describe('bet placement', () => {
    beforeEach(() => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
    });

    it('should deduct chips on bet', () => {
      const ok = ledger.placeBet(PLAYER_A, 100000n, 'bet-1');
      expect(ok).toBe(true);
      expect(ledger.getBalance(PLAYER_A)).toBe(900000n);
    });

    it('should reject bet exceeding balance', () => {
      const ok = ledger.placeBet(PLAYER_A, 2000000n, 'bet-1');
      expect(ok).toBe(false);
      expect(ledger.getBalance(PLAYER_A)).toBe(1000000n);
    });

    it('should track total bet', () => {
      ledger.placeBet(PLAYER_A, 100000n, 'bet-1');
      ledger.placeBet(PLAYER_A, 200000n, 'bet-2');
      const bal = ledger.getPlayerBalance(PLAYER_A);
      expect(bal.totalBet).toBe(300000n);
    });
  });

  describe('bet resolution', () => {
    beforeEach(() => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
      ledger.placeBet(PLAYER_A, 100000n, 'bet-1');
    });

    it('should credit payout on win', () => {
      ledger.betWon(PLAYER_A, 200000n, 'bet-1'); // 1:1 payout = original + winnings
      expect(ledger.getBalance(PLAYER_A)).toBe(1100000n); // 900K + 200K
    });

    it('should track losses', () => {
      ledger.betLost(PLAYER_A, 100000n, 'bet-1');
      expect(ledger.getBalance(PLAYER_A)).toBe(900000n); // chips already deducted
      const bal = ledger.getPlayerBalance(PLAYER_A);
      expect(bal.totalLost).toBe(100000n);
    });

    it('should return chips on push', () => {
      ledger.betPushed(PLAYER_A, 100000n, 'bet-1');
      expect(ledger.getBalance(PLAYER_A)).toBe(1000000n);
    });
  });

  describe('cashouts', () => {
    beforeEach(() => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
    });

    it('should deduct chips and create pending cashout', () => {
      const req = ledger.requestCashout(PLAYER_A, 500000n, PLAYER_A);
      expect(req.status).toBe('pending');
      expect(ledger.getBalance(PLAYER_A)).toBe(500000n);
    });

    it('should reject cashout exceeding balance', () => {
      expect(() => ledger.requestCashout(PLAYER_A, 2000000n, PLAYER_A)).toThrow();
    });

    it('should list pending cashouts', () => {
      ledger.requestCashout(PLAYER_A, 500000n, PLAYER_A);
      const pending = ledger.getPendingCashouts();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.player).toBe(PLAYER_A);
    });

    it('should complete cashout', () => {
      const req = ledger.requestCashout(PLAYER_A, 500000n, PLAYER_A);
      ledger.completeCashout(req.id, '0xPAYOUT_TX');
      const pending = ledger.getPendingCashouts();
      expect(pending).toHaveLength(0);
    });
  });

  describe('refunds', () => {
    it('should refund bet and restore balance', () => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
      ledger.placeBet(PLAYER_A, 100000n, 'bet-1');
      expect(ledger.getBalance(PLAYER_A)).toBe(900000n);
      ledger.refundBet(PLAYER_A, 100000n, 'bet-1');
      expect(ledger.getBalance(PLAYER_A)).toBe(1000000n);
    });
  });

  describe('house P&L', () => {
    it('should track house profit', () => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
      ledger.placeBet(PLAYER_A, 100000n, 'bet-1');
      ledger.betLost(PLAYER_A, 100000n, 'bet-1');

      ledger.placeBet(PLAYER_A, 100000n, 'bet-2');
      ledger.betWon(PLAYER_A, 200000n, 'bet-2');

      const pnl = ledger.getHousePnL();
      // Total bet: 200K, total won: 200K, profit = 200K - 200K = 0
      expect(pnl.profit).toBe(0n);
    });

    it('should show profit when house wins', () => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
      ledger.placeBet(PLAYER_A, 100000n, 'bet-1');
      ledger.betLost(PLAYER_A, 100000n, 'bet-1');

      const pnl = ledger.getHousePnL();
      expect(pnl.profit).toBe(100000n);
    });
  });

  describe('history', () => {
    it('should track all transactions', () => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
      ledger.placeBet(PLAYER_A, 100000n, 'bet-1');
      ledger.betWon(PLAYER_A, 200000n, 'bet-1');

      const history = ledger.getHistory(PLAYER_A);
      expect(history).toHaveLength(3);
      expect(history[0]!.type).toBe('deposit');
      expect(history[1]!.type).toBe('bet_placed');
      expect(history[2]!.type).toBe('bet_won');
    });
  });

  describe('multiple players', () => {
    it('should track balances independently', () => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
      ledger.confirmDeposit(PLAYER_B, 500000n, '0xTX2');

      ledger.placeBet(PLAYER_A, 100000n, 'bet-1');

      expect(ledger.getBalance(PLAYER_A)).toBe(900000n);
      expect(ledger.getBalance(PLAYER_B)).toBe(500000n);
    });

    it('should list all balances', () => {
      ledger.confirmDeposit(PLAYER_A, 1000000n, '0xTX1');
      ledger.confirmDeposit(PLAYER_B, 500000n, '0xTX2');

      const all = ledger.getAllBalances();
      expect(all).toHaveLength(2);
    });
  });
});
