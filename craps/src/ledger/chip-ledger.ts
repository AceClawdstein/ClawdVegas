/**
 * Chip Ledger — Offchain balance tracking for ClawdVegas CRABS
 *
 * Flow:
 * 1. Agent sends $CLAWDVEGAS to Ace's wallet (onchain)
 * 2. Operator confirms deposit → chips credited
 * 3. Agent plays (chips deducted/credited per bet resolution)
 * 4. Agent requests cashout → Ace sends $CLAWDVEGAS back
 *
 * All amounts in token units (bigint). No floating point ever.
 * Optionally persists to a JSON file via JsonStore.
 */

import { EventEmitter } from 'events';
import { JsonStore, type StoreData } from './store.js';

/** Deposit record */
export interface Deposit {
  readonly id: string;
  readonly player: string;
  readonly amount: bigint;
  readonly txHash: string;
  readonly confirmedAt: number;
}

/** Cashout request */
export interface CashoutRequest {
  readonly id: string;
  readonly player: string;
  readonly amount: bigint;
  readonly toAddress: string;
  readonly requestedAt: number;
  readonly status: 'pending' | 'processing' | 'completed' | 'failed';
  readonly txHash: string | null;
}

/** Player balance snapshot */
export interface PlayerBalance {
  readonly address: string;
  readonly chips: bigint;
  readonly totalDeposited: bigint;
  readonly totalWithdrawn: bigint;
  readonly totalWon: bigint;
  readonly totalLost: bigint;
  readonly totalBet: bigint;
}

/** Ledger transaction types */
export type LedgerTxType =
  | 'deposit'
  | 'bet_placed'
  | 'bet_won'
  | 'bet_lost'
  | 'bet_pushed'
  | 'bet_refunded'
  | 'cashout';

/** Individual ledger entry */
export interface LedgerEntry {
  readonly id: string;
  readonly player: string;
  readonly type: LedgerTxType;
  readonly amount: bigint;
  readonly balance: bigint;
  readonly timestamp: number;
  readonly ref: string;
}

export class ChipLedger extends EventEmitter {
  private balances: Map<string, bigint> = new Map();
  private deposits: Deposit[] = [];
  private cashouts: CashoutRequest[] = [];
  private ledger: LedgerEntry[] = [];
  private stats: Map<string, {
    totalDeposited: bigint;
    totalWithdrawn: bigint;
    totalWon: bigint;
    totalLost: bigint;
    totalBet: bigint;
  }> = new Map();

  /** Persistence store (null = in-memory only, used by tests) */
  private store: JsonStore | null;

  readonly houseWallet: string;
  readonly minDeposit: bigint;
  readonly minCashout: bigint;

  constructor(opts: {
    houseWallet: string;
    minDeposit?: bigint;
    minCashout?: bigint;
    storePath?: string;
  }) {
    super();
    this.houseWallet = opts.houseWallet;
    this.minDeposit = opts.minDeposit ?? 10000n;
    this.minCashout = opts.minCashout ?? 10000n;

    if (opts.storePath) {
      this.store = new JsonStore(opts.storePath);
      this.restoreFromStore();
    } else {
      this.store = null;
    }
  }

  // --- Persistence ---

  private persist(): void {
    if (!this.store) return;

    const data: StoreData = {
      balances: Object.fromEntries(
        Array.from(this.balances.entries()).map(([k, v]) => [k, v.toString()])
      ),
      stats: Object.fromEntries(
        Array.from(this.stats.entries()).map(([k, v]) => [k, {
          totalDeposited: v.totalDeposited.toString(),
          totalWithdrawn: v.totalWithdrawn.toString(),
          totalWon: v.totalWon.toString(),
          totalLost: v.totalLost.toString(),
          totalBet: v.totalBet.toString(),
        }])
      ),
      deposits: this.deposits.map(d => ({
        id: d.id,
        player: d.player,
        amount: d.amount.toString(),
        txHash: d.txHash,
        confirmedAt: d.confirmedAt,
      })),
      cashouts: this.cashouts.map(c => ({
        id: c.id,
        player: c.player,
        amount: c.amount.toString(),
        toAddress: c.toAddress,
        requestedAt: c.requestedAt,
        status: c.status,
        txHash: c.txHash,
      })),
      ledger: this.ledger.map(e => ({
        id: e.id,
        player: e.player,
        type: e.type,
        amount: e.amount.toString(),
        balance: e.balance.toString(),
        timestamp: e.timestamp,
        ref: e.ref,
      })),
    };

    this.store.setData(data);
  }

  private restoreFromStore(): void {
    if (!this.store) return;
    const data = this.store.getData();

    // Restore balances
    for (const [addr, val] of Object.entries(data.balances)) {
      this.balances.set(addr, BigInt(val));
    }

    // Restore stats
    for (const [addr, s] of Object.entries(data.stats)) {
      this.stats.set(addr, {
        totalDeposited: BigInt(s.totalDeposited),
        totalWithdrawn: BigInt(s.totalWithdrawn),
        totalWon: BigInt(s.totalWon),
        totalLost: BigInt(s.totalLost),
        totalBet: BigInt(s.totalBet),
      });
    }

    // Restore deposits
    this.deposits = data.deposits.map(d => ({
      id: d.id,
      player: d.player,
      amount: BigInt(d.amount),
      txHash: d.txHash,
      confirmedAt: d.confirmedAt,
    }));

    // Restore cashouts
    this.cashouts = data.cashouts.map(c => ({
      id: c.id,
      player: c.player,
      amount: BigInt(c.amount),
      toAddress: c.toAddress,
      requestedAt: c.requestedAt,
      status: c.status as CashoutRequest['status'],
      txHash: c.txHash,
    }));

    // Restore ledger
    this.ledger = data.ledger.map(e => ({
      id: e.id,
      player: e.player,
      type: e.type as LedgerTxType,
      amount: BigInt(e.amount),
      balance: BigInt(e.balance),
      timestamp: e.timestamp,
      ref: e.ref,
    }));
  }

  // --- Public API (unchanged signatures) ---

  getBalance(player: string): bigint {
    return this.balances.get(player) ?? 0n;
  }

  getPlayerBalance(player: string): PlayerBalance {
    const s = this.stats.get(player);
    return {
      address: player,
      chips: this.getBalance(player),
      totalDeposited: s?.totalDeposited ?? 0n,
      totalWithdrawn: s?.totalWithdrawn ?? 0n,
      totalWon: s?.totalWon ?? 0n,
      totalLost: s?.totalLost ?? 0n,
      totalBet: s?.totalBet ?? 0n,
    };
  }

  getAllBalances(): PlayerBalance[] {
    const players = new Set([...this.balances.keys(), ...this.stats.keys()]);
    return Array.from(players).map(p => this.getPlayerBalance(p));
  }

  confirmDeposit(player: string, amount: bigint, txHash: string): Deposit {
    if (amount < this.minDeposit) {
      throw new Error(`Deposit below minimum (${this.minDeposit})`);
    }

    const deposit: Deposit = {
      id: `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      player,
      amount,
      txHash,
      confirmedAt: Date.now(),
    };

    this.credit(player, amount);
    this.deposits.push(deposit);

    const s = this.getOrCreateStats(player);
    s.totalDeposited += amount;

    this.addEntry(player, 'deposit', amount, txHash);
    this.persist();

    this.emit('deposit_confirmed', deposit);
    return deposit;
  }

  placeBet(player: string, amount: bigint, betId: string): boolean {
    const balance = this.getBalance(player);
    if (balance < amount) {
      return false;
    }

    this.debit(player, amount);
    const s = this.getOrCreateStats(player);
    s.totalBet += amount;

    this.addEntry(player, 'bet_placed', amount, betId);
    this.persist();
    return true;
  }

  betWon(player: string, payout: bigint, betId: string): void {
    this.credit(player, payout);
    const s = this.getOrCreateStats(player);
    s.totalWon += payout;

    this.addEntry(player, 'bet_won', payout, betId);
    this.persist();
    this.emit('bet_won', { player, payout, betId });
  }

  betLost(player: string, amount: bigint, betId: string): void {
    const s = this.getOrCreateStats(player);
    s.totalLost += amount;

    this.addEntry(player, 'bet_lost', amount, betId);
    this.persist();
  }

  betPushed(player: string, amount: bigint, betId: string): void {
    this.credit(player, amount);
    this.addEntry(player, 'bet_pushed', amount, betId);
    this.persist();
  }

  refundBet(player: string, amount: bigint, betId: string): void {
    this.credit(player, amount);
    const s = this.getOrCreateStats(player);
    s.totalBet -= amount;

    this.addEntry(player, 'bet_refunded', amount, betId);
    this.persist();
  }

  requestCashout(player: string, amount: bigint, toAddress: string): CashoutRequest {
    const balance = this.getBalance(player);
    if (amount > balance) {
      throw new Error(`Insufficient chips. Have ${balance}, want ${amount}`);
    }
    if (amount < this.minCashout) {
      throw new Error(`Below minimum cashout (${this.minCashout})`);
    }

    this.debit(player, amount);

    const request: CashoutRequest = {
      id: `cash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      player,
      amount,
      toAddress,
      requestedAt: Date.now(),
      status: 'pending',
      txHash: null,
    };

    this.cashouts.push(request);

    const s = this.getOrCreateStats(player);
    s.totalWithdrawn += amount;

    this.addEntry(player, 'cashout', amount, request.id);
    this.persist();

    this.emit('cashout_requested', request);
    return request;
  }

  completeCashout(cashoutId: string, txHash: string): void {
    const idx = this.cashouts.findIndex(c => c.id === cashoutId);
    if (idx === -1) throw new Error(`Cashout ${cashoutId} not found`);

    const old = this.cashouts[idx]!;
    this.cashouts[idx] = { ...old, status: 'completed', txHash };
    this.persist();

    this.emit('cashout_completed', { cashoutId, txHash });
  }

  getPendingCashouts(): CashoutRequest[] {
    return this.cashouts.filter(c => c.status === 'pending');
  }

  getDeposits(): Deposit[] {
    return [...this.deposits];
  }

  getHistory(player?: string, limit: number = 50): LedgerEntry[] {
    let entries = this.ledger;
    if (player) {
      entries = entries.filter(e => e.player === player);
    }
    return entries.slice(-limit);
  }

  getHousePnL(): { totalIn: bigint; totalOut: bigint; profit: bigint } {
    const allStats = Array.from(this.stats.values());
    const playerWins = allStats.reduce((sum, s) => sum + s.totalWon, 0n);
    const playerBets = allStats.reduce((sum, s) => sum + s.totalBet, 0n);
    const profit = playerBets - playerWins;
    return { totalIn: playerBets, totalOut: playerWins, profit };
  }

  // --- Private helpers ---

  private credit(player: string, amount: bigint): void {
    const current = this.balances.get(player) ?? 0n;
    this.balances.set(player, current + amount);
  }

  private debit(player: string, amount: bigint): void {
    const current = this.balances.get(player) ?? 0n;
    if (current < amount) {
      throw new Error(`Insufficient balance: have ${current}, need ${amount}`);
    }
    this.balances.set(player, current - amount);
  }

  private getOrCreateStats(player: string) {
    let s = this.stats.get(player);
    if (!s) {
      s = { totalDeposited: 0n, totalWithdrawn: 0n, totalWon: 0n, totalLost: 0n, totalBet: 0n };
      this.stats.set(player, s);
    }
    return s;
  }

  private addEntry(player: string, type: LedgerTxType, amount: bigint, ref: string): void {
    this.ledger.push({
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      player,
      type,
      amount,
      balance: this.getBalance(player),
      timestamp: Date.now(),
      ref,
    });
  }
}
