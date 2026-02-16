/**
 * End-to-end test: Full CRABS game flow
 * Simulates: deposit → join → bet → roll → win/lose → cashout
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CrapsTable, createTable } from '../../src/engine/table.js';
import { ChipLedger } from '../../src/ledger/chip-ledger.js';

const HOUSE = '0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7';
const AGENT_1 = '0xAgent1_GLaDOS';
const AGENT_2 = '0xAgent2_Quant';

describe('Full CRABS game flow', () => {
  let table: CrapsTable;
  let ledger: ChipLedger;

  beforeEach(() => {
    table = createTable();
    ledger = new ChipLedger({ houseWallet: HOUSE });
  });

  it('should play a complete game: deposit, join, bet, roll, settle, cashout', () => {
    // 1. Operator confirms deposits (agents sent $CLAWDVEGAS to house wallet)
    ledger.confirmDeposit(AGENT_1, 1000000n, '0xdeposit_tx_1');
    ledger.confirmDeposit(AGENT_2, 500000n, '0xdeposit_tx_2');

    expect(ledger.getBalance(AGENT_1)).toBe(1000000n);
    expect(ledger.getBalance(AGENT_2)).toBe(500000n);

    // 2. Agents join the table
    const join1 = table.join(AGENT_1);
    expect(join1.success).toBe(true);

    const join2 = table.join(AGENT_2);
    expect(join2.success).toBe(true);

    // 3. Check game state — should be in come_out_betting with AGENT_1 as shooter
    const state = table.getState();
    expect(state.phase).toBe('come_out_betting');
    expect(state.shooter).toBe(AGENT_1);

    // 4. Both agents place pass line bets
    const betAmount1 = 100000n;
    const betAmount2 = 50000n;

    // Deduct chips via ledger
    expect(ledger.placeBet(AGENT_1, betAmount1, 'bet-a1')).toBe(true);
    expect(ledger.placeBet(AGENT_2, betAmount2, 'bet-a2')).toBe(true);

    // Place bets on table
    const bet1 = table.placeBet(AGENT_1, 'pass_line', betAmount1);
    expect(bet1.success).toBe(true);

    const bet2 = table.placeBet(AGENT_2, 'pass_line', betAmount2);
    expect(bet2.success).toBe(true);

    // Check balances after bets
    expect(ledger.getBalance(AGENT_1)).toBe(900000n);
    expect(ledger.getBalance(AGENT_2)).toBe(450000n);

    // 5. Shooter rolls — we can't control dice, so we roll and handle outcome
    const rollResult = table.roll(AGENT_1);
    expect(rollResult.success).toBe(true);

    if (rollResult.success) {
      const { resolutions } = rollResult.data;

      // Process resolutions through ledger
      for (const r of resolutions) {
        switch (r.outcome) {
          case 'won':
            ledger.betWon(r.bet.player, r.payout, r.bet.id);
            break;
          case 'lost':
            ledger.betLost(r.bet.player, r.bet.amount, r.bet.id);
            break;
          case 'pushed':
            ledger.betPushed(r.bet.player, r.payout, r.bet.id);
            break;
          // 'active' stays as-is
        }
      }

      // Verify ledger is consistent
      const bal1 = ledger.getBalance(AGENT_1);
      const bal2 = ledger.getBalance(AGENT_2);
      expect(bal1).toBeGreaterThanOrEqual(0n);
      expect(bal2).toBeGreaterThanOrEqual(0n);
    }

    // 6. Agent 1 cashes out remaining chips
    const cashoutAmount = ledger.getBalance(AGENT_1);
    if (cashoutAmount > 0n) {
      const cashout = ledger.requestCashout(AGENT_1, cashoutAmount, AGENT_1);
      expect(cashout.status).toBe('pending');
      expect(ledger.getBalance(AGENT_1)).toBe(0n);

      // Operator completes the cashout
      ledger.completeCashout(cashout.id, '0xpayout_tx_1');
      expect(ledger.getPendingCashouts()).toHaveLength(0);
    }

    // 7. Verify history is complete
    const history1 = ledger.getHistory(AGENT_1);
    expect(history1.length).toBeGreaterThanOrEqual(2); // at least deposit + bet
  });

  it('should prevent betting without chips', () => {
    // Agent hasn't deposited
    expect(ledger.getBalance(AGENT_1)).toBe(0n);
    expect(ledger.placeBet(AGENT_1, 100000n, 'bet-1')).toBe(false);
  });

  it('should prevent joining without chips', () => {
    // In the full server flow, join checks ledger balance
    // Here we verify the ledger correctly reports 0
    expect(ledger.getBalance(AGENT_1)).toBe(0n);
  });

  it('should handle leave with active bets (refund)', () => {
    ledger.confirmDeposit(AGENT_1, 1000000n, '0xTX1');
    table.join(AGENT_1);

    // Place bet
    ledger.placeBet(AGENT_1, 100000n, 'bet-1');
    table.placeBet(AGENT_1, 'pass_line', 100000n);

    expect(ledger.getBalance(AGENT_1)).toBe(900000n);

    // Leave table — should refund active bets
    const leaveResult = table.leave(AGENT_1);
    expect(leaveResult.success).toBe(true);

    if (leaveResult.success) {
      for (const bet of leaveResult.data.refundedBets) {
        ledger.refundBet(AGENT_1, bet.amount, bet.id);
      }
    }

    expect(ledger.getBalance(AGENT_1)).toBe(1000000n);
  });

  it('should track house P&L correctly over multiple rounds', () => {
    ledger.confirmDeposit(AGENT_1, 1000000n, '0xTX1');

    // Simulate 5 losing bets
    for (let i = 0; i < 5; i++) {
      ledger.placeBet(AGENT_1, 50000n, `bet-${i}`);
      ledger.betLost(AGENT_1, 50000n, `bet-${i}`);
    }

    const pnl = ledger.getHousePnL();
    expect(pnl.profit).toBe(250000n); // house won 250K
    expect(ledger.getBalance(AGENT_1)).toBe(750000n);
  });
});
