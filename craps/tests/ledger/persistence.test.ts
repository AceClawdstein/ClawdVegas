import { describe, it, expect, afterEach } from 'vitest';
import { ChipLedger } from '../../src/ledger/chip-ledger.js';
import { unlinkSync } from 'fs';
import { join } from 'path';

const TEST_FILE = join(import.meta.dirname, '../../data/test-ledger.json');
const HOUSE = '0xHOUSE';
const PLAYER = '0xALICE';

function cleanup() {
  try { unlinkSync(TEST_FILE); } catch {}
}

describe('Ledger persistence', () => {
  afterEach(cleanup);

  it('should survive a restart with balances intact', () => {
    // Session 1: deposit and bet
    const ledger1 = new ChipLedger({ houseWallet: HOUSE, storePath: TEST_FILE });
    ledger1.confirmDeposit(PLAYER, 1000000n, '0xTX1');
    ledger1.placeBet(PLAYER, 100000n, 'bet-1');
    ledger1.betWon(PLAYER, 200000n, 'bet-1');

    expect(ledger1.getBalance(PLAYER)).toBe(1100000n);

    // Session 2: create new ledger from same file (simulates restart)
    const ledger2 = new ChipLedger({ houseWallet: HOUSE, storePath: TEST_FILE });

    expect(ledger2.getBalance(PLAYER)).toBe(1100000n);
    expect(ledger2.getPlayerBalance(PLAYER).totalDeposited).toBe(1000000n);
    expect(ledger2.getPlayerBalance(PLAYER).totalWon).toBe(200000n);
    expect(ledger2.getPlayerBalance(PLAYER).totalBet).toBe(100000n);
  });

  it('should persist pending cashouts across restart', () => {
    const ledger1 = new ChipLedger({ houseWallet: HOUSE, storePath: TEST_FILE });
    ledger1.confirmDeposit(PLAYER, 1000000n, '0xTX1');
    const cashout = ledger1.requestCashout(PLAYER, 500000n, PLAYER);

    // Restart
    const ledger2 = new ChipLedger({ houseWallet: HOUSE, storePath: TEST_FILE });
    const pending = ledger2.getPendingCashouts();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(cashout.id);
    expect(pending[0]!.amount).toBe(500000n);
    expect(ledger2.getBalance(PLAYER)).toBe(500000n);
  });

  it('should persist history across restart', () => {
    const ledger1 = new ChipLedger({ houseWallet: HOUSE, storePath: TEST_FILE });
    ledger1.confirmDeposit(PLAYER, 1000000n, '0xTX1');
    ledger1.placeBet(PLAYER, 50000n, 'bet-1');
    ledger1.betLost(PLAYER, 50000n, 'bet-1');

    const ledger2 = new ChipLedger({ houseWallet: HOUSE, storePath: TEST_FILE });
    const history = ledger2.getHistory(PLAYER);
    expect(history).toHaveLength(3); // deposit, bet_placed, bet_lost
    expect(history[0]!.type).toBe('deposit');
    expect(history[2]!.type).toBe('bet_lost');
  });
});
