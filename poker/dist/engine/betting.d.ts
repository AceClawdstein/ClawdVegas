/**
 * Betting logic for No Limit Texas Hold'em
 * Handles valid actions, min/max raises, and betting round completion
 */
/** Player action types */
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
/** A player action */
export interface PlayerAction {
    readonly type: ActionType;
    readonly amount: bigint;
}
/** What actions are valid for the current player */
export interface ValidActions {
    readonly canFold: boolean;
    readonly canCheck: boolean;
    readonly canCall: boolean;
    readonly callAmount: bigint;
    readonly canBet: boolean;
    readonly canRaise: boolean;
    readonly minBet: bigint;
    readonly minRaise: bigint;
    readonly maxBet: bigint;
}
/** Betting round state */
export interface BettingState {
    readonly currentBet: bigint;
    readonly minRaise: bigint;
    readonly lastRaiser: string | null;
    readonly lastRaiseSize: bigint;
    readonly actedThisRound: Set<string>;
    readonly allInPlayers: Set<string>;
}
/** Player state needed for betting decisions */
export interface BettingPlayer {
    readonly address: string;
    readonly stack: bigint;
    readonly currentBet: bigint;
    readonly isFolded: boolean;
    readonly isAllIn: boolean;
}
/**
 * Create initial betting state for a new betting round
 */
export declare function createBettingState(bigBlind: bigint): BettingState;
/**
 * Create betting state after blinds are posted
 */
export declare function createBettingStateWithBlinds(bigBlind: bigint, bigBlindPlayer: string): BettingState;
/**
 * Get valid actions for a player
 */
export declare function getValidActions(player: BettingPlayer, bettingState: BettingState, bigBlind: bigint): ValidActions;
/**
 * Validate and normalize a player action
 * Returns normalized action or error
 */
export declare function validateAction(action: PlayerAction, player: BettingPlayer, validActions: ValidActions): {
    valid: true;
    action: PlayerAction;
} | {
    valid: false;
    error: string;
};
/**
 * Apply action to betting state
 * Returns new betting state
 */
export declare function applyAction(action: PlayerAction, player: BettingPlayer, bettingState: BettingState): BettingState;
/**
 * Check if betting round is complete
 * Complete when all non-folded, non-all-in players have acted and bet amounts match
 */
export declare function isBettingRoundComplete(players: readonly BettingPlayer[], bettingState: BettingState): boolean;
/**
 * Reset betting state for new round (after flop, turn, river)
 */
export declare function resetForNewRound(bettingState: BettingState, bigBlind: bigint): BettingState;
//# sourceMappingURL=betting.d.ts.map