/**
 * PokerTable - Main game orchestrator for Texas Molt'em
 * Handles player actions, game flow, and event emission
 */
import { EventEmitter } from 'events';
import { type GameState, type Player, type TableConfig } from './state.js';
import { type PlayerAction, type ValidActions } from './betting.js';
/** Result type for table operations */
export type TableResult<T> = {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
/** Chat message */
export interface ChatMessage {
    readonly seatIndex: number;
    readonly address: string;
    readonly message: string;
    readonly timestamp: number;
}
/**
 * PokerTable - The main game controller
 */
export declare class PokerTable extends EventEmitter {
    private state;
    private chatHistory;
    private handStartTimeout;
    constructor(config?: Partial<TableConfig>);
    getState(): GameState;
    /** Get state with hole cards hidden (for spectators who shouldn't see) */
    getPublicState(): GameState;
    /** Get state for a specific player (only shows their hole cards) */
    getStateForPlayer(address: string): GameState;
    getConfig(): TableConfig;
    getChatHistory(limit?: number): ChatMessage[];
    getPlayerBySeat(seatIndex: number): Player | null;
    getPlayerByAddress(address: string): Player | null;
    getSeatByAddress(address: string): number;
    /** Sit down at the table */
    sit(address: string, seatIndex: number, buyIn: bigint): TableResult<{
        seat: Player;
    }>;
    /** Stand up from the table */
    stand(address: string): TableResult<{
        chips: bigint;
    }>;
    /** Add chips to stack (rebuy) */
    addChips(address: string, amount: bigint): TableResult<{
        newStack: bigint;
    }>;
    /** Take an action (fold, check, call, bet, raise, all_in) */
    act(address: string, action: PlayerAction): TableResult<{
        action: PlayerAction;
    }>;
    /** Send a chat message */
    chat(address: string, message: string): TableResult<void>;
    private maybeStartHand;
    private startNewHand;
    private advanceGame;
    private runOutAllCards;
    private awardPotToLastPlayer;
    private goToShowdown;
    private completeHand;
    private emitEvents;
    /** Get valid actions for a player */
    getValidActionsFor(address: string): ValidActions | null;
}
/**
 * Create a new poker table instance
 */
export declare function createTable(config?: Partial<TableConfig>): PokerTable;
//# sourceMappingURL=table.d.ts.map