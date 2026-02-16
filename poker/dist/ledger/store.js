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
function emptyStore() {
    return {
        balances: {},
        stats: {},
        deposits: [],
        cashouts: [],
        ledger: [],
    };
}
export class JsonStore {
    filePath;
    data;
    constructor(filePath) {
        this.filePath = filePath;
        this.data = this.load();
    }
    load() {
        try {
            const raw = readFileSync(this.filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            console.log(`[store] Loaded ledger from ${this.filePath} (${Object.keys(parsed.balances).length} players, ${parsed.ledger.length} entries)`);
            return parsed;
        }
        catch {
            console.log(`[store] No existing ledger at ${this.filePath}, starting fresh`);
            return emptyStore();
        }
    }
    save() {
        mkdirSync(dirname(this.filePath), { recursive: true });
        writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    }
    getData() {
        return this.data;
    }
    setData(data) {
        this.data = data;
        this.save();
    }
}
//# sourceMappingURL=store.js.map