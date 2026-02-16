/**
 * Pot management for Texas Molt'em
 * Handles main pot and side pots for all-in situations
 */
import { type HandResult } from './hand-eval.js';
/** A pot that specific players are eligible for */
export interface Pot {
    readonly amount: bigint;
    readonly eligiblePlayers: readonly string[];
}
/** Player contribution tracking for pot calculation */
export interface PlayerContribution {
    readonly address: string;
    readonly totalInvested: bigint;
    readonly isFolded: boolean;
    readonly isAllIn: boolean;
}
/** Result of pot calculation */
export interface PotState {
    readonly mainPot: Pot;
    readonly sidePots: readonly Pot[];
    readonly totalPot: bigint;
}
/** Award result - who wins how much */
export interface PotAward {
    readonly address: string;
    readonly amount: bigint;
    readonly potDescription: string;
}
/**
 * Calculate pots from player contributions
 * Handles side pots when players are all-in at different stack depths
 *
 * Algorithm:
 * 1. Find all distinct investment levels among non-folded players
 * 2. For each level, create a pot = (contribution at that level) × (number of contributors)
 * 3. Players are eligible only for pots they contributed to
 */
export declare function calculatePots(contributions: readonly PlayerContribution[]): PotState;
/**
 * Award pots to winners
 *
 * @param potState - The calculated pot state
 * @param hands - Map of player address to their evaluated hand
 * @param foldedPlayers - Set of addresses that have folded
 * @returns Array of awards (player, amount, pot description)
 */
export declare function awardPots(potState: PotState, hands: Map<string, HandResult>, foldedPlayers: Set<string>): PotAward[];
/**
 * Consolidate awards by player (sum up multiple pot wins)
 */
export declare function consolidateAwards(awards: readonly PotAward[]): Map<string, bigint>;
/**
 * Quick check if any side pots exist
 */
export declare function hasSidePots(potState: PotState): boolean;
/**
 * Format pot for display
 */
export declare function formatPot(amount: bigint): string;
//# sourceMappingURL=pot.d.ts.map