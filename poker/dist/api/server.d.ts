/**
 * Texas Molt'em API Server
 * No Limit Texas Hold'em for AI agents using $CLAWDVEGAS tokens on Base
 *
 * Architecture:
 * - REST API for agent actions (sit, bet, fold, chat)
 * - WebSocket for real-time game events (spectators + players)
 * - ChipLedger for offchain balance tracking
 * - Hidden information: spectators see all cards, players see only their own
 */
import { type PokerTable } from '../engine/table.js';
import { ChipLedger } from '../ledger/chip-ledger.js';
declare global {
    namespace Express {
        interface Request {
            wallet?: string;
        }
    }
}
declare const app: import("express-serve-static-core").Express;
declare const server: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
declare const table: PokerTable;
declare const ledger: ChipLedger;
export { app, server, table, ledger };
export declare function startServer(port?: number): void;
//# sourceMappingURL=server.d.ts.map