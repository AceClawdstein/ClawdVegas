/**
 * Game state machine for Texas Molt'em
 * Manages hand phases and state transitions
 */
import { type Card } from './deck.js';
import { type BettingState } from './betting.js';
/** Hand phases */
export type HandPhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
/** Player at the table */
export interface Player {
    readonly address: string;
    readonly seatIndex: number;
    readonly stack: bigint;
    readonly holeCards: readonly Card[] | null;
    readonly currentBet: bigint;
    readonly totalInvested: bigint;
    readonly isFolded: boolean;
    readonly isAllIn: boolean;
    readonly isSittingOut: boolean;
}
/** Table configuration */
export interface TableConfig {
    readonly tableId: string;
    readonly smallBlind: bigint;
    readonly bigBlind: bigint;
    readonly minBuyIn: bigint;
    readonly maxBuyIn: bigint;
    readonly maxSeats: number;
    readonly actionTimeoutMs: number;
}
/** Full game state */
export interface GameState {
    readonly config: TableConfig;
    readonly phase: HandPhase;
    readonly handNumber: number;
    readonly seats: readonly (Player | null)[];
    readonly communityCards: readonly Card[];
    readonly deck: readonly Card[];
    readonly buttonPosition: number;
    readonly activePosition: number;
    readonly bettingState: BettingState;
    readonly lastAction: {
        address: string;
        action: string;
        amount: bigint;
    } | null;
    readonly actionDeadline: number | null;
}
/** Game events for logging/broadcast */
export type GameEvent = {
    type: 'hand_started';
    handNumber: number;
    button: number;
} | {
    type: 'hole_cards_dealt';
    seatIndex: number;
    cards: Card[];
} | {
    type: 'blinds_posted';
    smallBlind: {
        seat: number;
        amount: bigint;
    };
    bigBlind: {
        seat: number;
        amount: bigint;
    };
} | {
    type: 'action_on';
    seatIndex: number;
    deadline: number;
} | {
    type: 'player_acted';
    seatIndex: number;
    action: string;
    amount: bigint;
    newStack: bigint;
} | {
    type: 'flop_dealt';
    cards: Card[];
} | {
    type: 'turn_dealt';
    card: Card;
} | {
    type: 'river_dealt';
    card: Card;
} | {
    type: 'showdown';
    hands: Array<{
        seatIndex: number;
        cards: Card[];
        handName: string;
    }>;
} | {
    type: 'pot_awarded';
    winners: Array<{
        seatIndex: number;
        amount: bigint;
    }>;
} | {
    type: 'hand_complete';
} | {
    type: 'phase_changed';
    phase: HandPhase;
};
/** Result of a state transition */
export type TransitionResult = {
    success: true;
    state: GameState;
    events: GameEvent[];
} | {
    success: false;
    error: string;
};
/** Default table configuration */
export declare const DEFAULT_CONFIG: TableConfig;
/**
 * Create initial game state
 */
export declare function createInitialState(config?: Partial<TableConfig>): GameState;
/**
 * Get active (non-folded, seated) players
 */
export declare function getActivePlayers(state: GameState): Player[];
/**
 * Get players still in the hand (not folded)
 */
export declare function getPlayersInHand(state: GameState): Player[];
/**
 * Get players who can still act (not folded, not all-in)
 */
export declare function getPlayersWhoCanAct(state: GameState): Player[];
/**
 * Find next position to act (clockwise from current)
 */
export declare function findNextActivePosition(state: GameState, fromPosition: number): number;
/**
 * Get small blind position (left of button)
 */
export declare function getSmallBlindPosition(state: GameState): number;
/**
 * Get big blind position (left of small blind)
 */
export declare function getBigBlindPosition(state: GameState): number;
/**
 * Get first to act preflop (left of big blind)
 */
export declare function getFirstToActPreflop(state: GameState): number;
/**
 * Get first to act postflop (left of button)
 */
export declare function getFirstToActPostflop(state: GameState): number;
/**
 * Check if enough players to start a hand
 */
export declare function canStartHand(state: GameState): boolean;
/**
 * Start a new hand
 */
export declare function startHand(state: GameState): TransitionResult;
/**
 * Deal community cards for next phase
 */
export declare function dealCommunityCards(state: GameState): TransitionResult;
/**
 * Check if hand should go to showdown
 */
export declare function shouldGoToShowdown(state: GameState): boolean;
/**
 * Check if all remaining players are all-in
 */
export declare function allPlayersAllIn(state: GameState): boolean;
//# sourceMappingURL=state.d.ts.map