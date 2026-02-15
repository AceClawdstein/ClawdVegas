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
export type LedgerTxType = 'deposit' | 'bet_placed' | 'bet_won' | 'bet_lost' | 'bet_pushed' | 'bet_refunded' | 'cashout';
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
export declare class ChipLedger extends EventEmitter {
    private balances;
    private deposits;
    private cashouts;
    private ledger;
    private stats;
    /** Persistence store (null = in-memory only, used by tests) */
    private store;
    readonly houseWallet: string;
    readonly minDeposit: bigint;
    readonly minCashout: bigint;
    constructor(opts: {
        houseWallet: string;
        minDeposit?: bigint;
        minCashout?: bigint;
        storePath?: string;
    });
    private persist;
    private restoreFromStore;
    getBalance(player: string): bigint;
    getPlayerBalance(player: string): PlayerBalance;
    getAllBalances(): PlayerBalance[];
    confirmDeposit(player: string, amount: bigint, txHash: string): Deposit;
    placeBet(player: string, amount: bigint, betId: string): boolean;
    betWon(player: string, payout: bigint, betId: string): void;
    betLost(player: string, amount: bigint, betId: string): void;
    betPushed(player: string, amount: bigint, betId: string): void;
    refundBet(player: string, amount: bigint, betId: string): void;
    requestCashout(player: string, amount: bigint, toAddress: string): CashoutRequest;
    completeCashout(cashoutId: string, txHash: string): void;
    getPendingCashouts(): CashoutRequest[];
    getDeposits(): Deposit[];
    getHistory(player?: string, limit?: number): LedgerEntry[];
    getHousePnL(): {
        totalIn: bigint;
        totalOut: bigint;
        profit: bigint;
    };
    private credit;
    private debit;
    private getOrCreateStats;
    private addEntry;
}
//# sourceMappingURL=chip-ledger.d.ts.map