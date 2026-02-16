/**
 * Persistent JSON file store for the chip ledger.
 *
 * Writes a single JSON file to disk after every mutation.
 * Loads it on startup. If the file doesn't exist, starts fresh.
 *
 * The file stores: balances, stats, deposits, cashouts, ledger entries.
 * All bigint values are serialized as strings and restored on load.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/** Shape of the persisted data */
export interface StoreData {
  balances: Record<string, string>;        // address → bigint as string
  stats: Record<string, {
    totalDeposited: string;
    totalWithdrawn: string;
    totalWon: string;
    totalLost: string;
    totalBet: string;
  }>;
  deposits: Array<{
    id: string;
    player: string;
    amount: string;
    txHash: string;
    confirmedAt: number;
  }>;
  cashouts: Array<{
    id: string;
    player: string;
    amount: string;
    toAddress: string;
    requestedAt: number;
    status: string;
    txHash: string | null;
  }>;
  ledger: Array<{
    id: string;
    player: string;
    type: string;
    amount: string;
    balance: string;
    timestamp: number;
    ref: string;
  }>;
}

function emptyStore(): StoreData {
  return {
    balances: {},
    stats: {},
    deposits: [],
    cashouts: [],
    ledger: [],
  };
}

export class JsonStore {
  private filePath: string;
  private data: StoreData;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as StoreData;
      console.log(`[store] Loaded ledger from ${this.filePath} (${Object.keys(parsed.balances).length} players, ${parsed.ledger.length} entries)`);
      return parsed;
    } catch {
      console.log(`[store] No existing ledger at ${this.filePath}, starting fresh`);
      return emptyStore();
    }
  }

  save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  getData(): StoreData {
    return this.data;
  }

  setData(data: StoreData): void {
    this.data = data;
    this.save();
  }
}
