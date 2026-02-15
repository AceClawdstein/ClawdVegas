/**
 * Persistent JSON file store for the chip ledger.
 *
 * Writes a single JSON file to disk after every mutation.
 * Loads it on startup. If the file doesn't exist, starts fresh.
 *
 * The file stores: balances, stats, deposits, cashouts, ledger entries.
 * All bigint values are serialized as strings and restored on load.
 */
/** Shape of the persisted data */
export interface StoreData {
    balances: Record<string, string>;
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
export declare class JsonStore {
    private filePath;
    private data;
    constructor(filePath: string);
    private load;
    save(): void;
    getData(): StoreData;
    setData(data: StoreData): void;
}
//# sourceMappingURL=store.d.ts.map