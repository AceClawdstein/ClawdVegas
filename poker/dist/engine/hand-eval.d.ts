/**
 * Hand evaluation for Texas Molt'em
 * Evaluates the best 5-card hand from 7 cards (2 hole + 5 community)
 */
import { type Card } from './deck.js';
/** Hand rankings from lowest to highest */
export declare enum HandRank {
    HighCard = 0,
    Pair = 1,
    TwoPair = 2,
    ThreeOfAKind = 3,
    Straight = 4,
    Flush = 5,
    FullHouse = 6,
    FourOfAKind = 7,
    StraightFlush = 8
}
export declare const HAND_RANK_NAMES: Record<HandRank, string>;
/** Result of hand evaluation */
export interface HandResult {
    readonly rank: HandRank;
    readonly rankName: string;
    readonly bestFive: Card[];
    readonly score: number;
    readonly description: string;
}
/**
 * Evaluate the best 5-card hand from 7 cards (2 hole + 5 community)
 * Checks all C(7,5) = 21 combinations
 */
export declare function evaluateHand(cards: readonly Card[]): HandResult;
/**
 * Compare two hands: returns negative if a < b, 0 if equal, positive if a > b
 */
export declare function compareHands(a: HandResult, b: HandResult): number;
/**
 * Find indices of winning hands from an array
 * Returns array of indices (multiple if tie/split pot)
 */
export declare function findWinners(hands: readonly HandResult[]): number[];
/**
 * Quick hand description for display
 */
export declare function getHandRankName(rank: HandRank): string;
//# sourceMappingURL=hand-eval.d.ts.map