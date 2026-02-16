/**
 * Hand evaluation for Texas Molt'em
 * Evaluates the best 5-card hand from 7 cards (2 hole + 5 community)
 */

import { type Card, RANK_VALUES, sortByRank, sameSuit, cardDisplay } from './deck.js';

/** Hand rankings from lowest to highest */
export enum HandRank {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  // RoyalFlush is just a StraightFlush with A-high, same rank value
}

export const HAND_RANK_NAMES: Record<HandRank, string> = {
  [HandRank.HighCard]: 'High Card',
  [HandRank.Pair]: 'Pair',
  [HandRank.TwoPair]: 'Two Pair',
  [HandRank.ThreeOfAKind]: 'Three of a Kind',
  [HandRank.Straight]: 'Straight',
  [HandRank.Flush]: 'Flush',
  [HandRank.FullHouse]: 'Full House',
  [HandRank.FourOfAKind]: 'Four of a Kind',
  [HandRank.StraightFlush]: 'Straight Flush',
};

/** Result of hand evaluation */
export interface HandResult {
  readonly rank: HandRank;
  readonly rankName: string;        // e.g., "Pair of Aces", "Flush, King high"
  readonly bestFive: Card[];        // The best 5-card combination
  readonly score: number;           // Numeric score for comparison (higher wins)
  readonly description: string;     // Full description for display
}

/**
 * Get all C(n,k) combinations
 */
function combinations<T>(arr: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];

  const result: T[][] = [];
  const first = arr[0]!;
  const rest = arr.slice(1);

  // Combinations that include first
  for (const combo of combinations(rest, k - 1)) {
    result.push([first, ...combo]);
  }

  // Combinations that don't include first
  for (const combo of combinations(rest, k)) {
    result.push(combo);
  }

  return result;
}

/**
 * Count cards by rank
 */
function countByRank(cards: readonly Card[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

/**
 * Check if 5 cards form a straight (returns high card value, or 0 if not straight)
 * Handles ace-low straight (A-2-3-4-5 = "the wheel")
 */
function getStraightHighCard(cards: readonly Card[]): number {
  if (cards.length !== 5) return 0;

  const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);

  // Check normal straight (consecutive values)
  let isConsecutive = true;
  for (let i = 0; i < 4; i++) {
    if (values[i]! - values[i + 1]! !== 1) {
      isConsecutive = false;
      break;
    }
  }
  if (isConsecutive) {
    return values[0]!; // High card
  }

  // Check ace-low straight (A-2-3-4-5 = values [14, 5, 4, 3, 2])
  if (
    values[0] === 14 && // Ace
    values[1] === 5 &&
    values[2] === 4 &&
    values[3] === 3 &&
    values[4] === 2
  ) {
    return 5; // 5-high straight (the wheel)
  }

  return 0;
}

/**
 * Evaluate a single 5-card hand
 */
function evaluate5Cards(cards: readonly Card[]): HandResult {
  if (cards.length !== 5) {
    throw new Error('Must evaluate exactly 5 cards');
  }

  const sorted = sortByRank(cards);
  const isFlush = sameSuit(cards);
  const straightHigh = getStraightHighCard(cards);
  const isStraight = straightHigh > 0;
  const counts = countByRank(cards);

  // Get counts sorted by frequency then rank
  const countPairs = Array.from(counts.entries())
    .map(([rank, count]) => ({ rank, count, value: RANK_VALUES[rank as keyof typeof RANK_VALUES] }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.value - a.value;
    });

  // Determine hand rank and build score
  // Score format: RKKKKK where R = hand rank (0-8), KKKKK = kickers for tiebreaking
  let rank: HandRank;
  let rankName: string;
  let score: number;

  const rankValue = (r: string) => RANK_VALUES[r as keyof typeof RANK_VALUES];
  const rankChar = (v: number) => {
    const entry = Object.entries(RANK_VALUES).find(([_, val]) => val === v);
    return entry ? entry[0] : '?';
  };

  // Check for straight flush (including royal flush)
  if (isFlush && isStraight) {
    rank = HandRank.StraightFlush;
    if (straightHigh === 14) {
      rankName = 'Royal Flush';
    } else {
      rankName = `Straight Flush, ${rankChar(straightHigh)} high`;
    }
    score = rank * 10000000 + straightHigh;
  }
  // Four of a kind
  else if (countPairs[0]!.count === 4) {
    rank = HandRank.FourOfAKind;
    const quadRank = countPairs[0]!.rank;
    const kicker = countPairs[1]!.rank;
    rankName = `Four ${quadRank}s`;
    score = rank * 10000000 + rankValue(quadRank) * 100 + rankValue(kicker);
  }
  // Full house
  else if (countPairs[0]!.count === 3 && countPairs[1]!.count === 2) {
    rank = HandRank.FullHouse;
    const tripRank = countPairs[0]!.rank;
    const pairRank = countPairs[1]!.rank;
    rankName = `Full House, ${tripRank}s full of ${pairRank}s`;
    score = rank * 10000000 + rankValue(tripRank) * 100 + rankValue(pairRank);
  }
  // Flush
  else if (isFlush) {
    rank = HandRank.Flush;
    const values = sorted.map(c => RANK_VALUES[c.rank]);
    rankName = `Flush, ${sorted[0]!.rank} high`;
    score = rank * 10000000 +
      values[0]! * 10000 + values[1]! * 1000 + values[2]! * 100 + values[3]! * 10 + values[4]!;
  }
  // Straight
  else if (isStraight) {
    rank = HandRank.Straight;
    rankName = `Straight, ${rankChar(straightHigh)} high`;
    score = rank * 10000000 + straightHigh;
  }
  // Three of a kind
  else if (countPairs[0]!.count === 3) {
    rank = HandRank.ThreeOfAKind;
    const tripRank = countPairs[0]!.rank;
    const kicker1 = countPairs[1]!.rank;
    const kicker2 = countPairs[2]!.rank;
    rankName = `Three ${tripRank}s`;
    score = rank * 10000000 +
      rankValue(tripRank) * 10000 + rankValue(kicker1) * 100 + rankValue(kicker2);
  }
  // Two pair
  else if (countPairs[0]!.count === 2 && countPairs[1]!.count === 2) {
    rank = HandRank.TwoPair;
    const highPair = countPairs[0]!.rank;
    const lowPair = countPairs[1]!.rank;
    const kicker = countPairs[2]!.rank;
    rankName = `Two Pair, ${highPair}s and ${lowPair}s`;
    score = rank * 10000000 +
      rankValue(highPair) * 10000 + rankValue(lowPair) * 100 + rankValue(kicker);
  }
  // Pair
  else if (countPairs[0]!.count === 2) {
    rank = HandRank.Pair;
    const pairRank = countPairs[0]!.rank;
    const kickers = countPairs.slice(1).map(p => rankValue(p.rank));
    rankName = `Pair of ${pairRank}s`;
    score = rank * 10000000 +
      rankValue(pairRank) * 100000 + kickers[0]! * 1000 + kickers[1]! * 100 + kickers[2]!;
  }
  // High card
  else {
    rank = HandRank.HighCard;
    const values = sorted.map(c => RANK_VALUES[c.rank]);
    rankName = `${sorted[0]!.rank} high`;
    score = rank * 10000000 +
      values[0]! * 10000 + values[1]! * 1000 + values[2]! * 100 + values[3]! * 10 + values[4]!;
  }

  const description = `${rankName} (${sorted.map(cardDisplay).join(' ')})`;

  return {
    rank,
    rankName,
    bestFive: sorted,
    score,
    description,
  };
}

/**
 * Evaluate the best 5-card hand from 7 cards (2 hole + 5 community)
 * Checks all C(7,5) = 21 combinations
 */
export function evaluateHand(cards: readonly Card[]): HandResult {
  if (cards.length < 5) {
    throw new Error(`Need at least 5 cards, got ${cards.length}`);
  }
  if (cards.length > 7) {
    throw new Error(`Too many cards: ${cards.length} (max 7)`);
  }

  // If exactly 5 cards, just evaluate them
  if (cards.length === 5) {
    return evaluate5Cards(cards);
  }

  // Get all 5-card combinations
  const allCombos = combinations(cards, 5);

  let best: HandResult | null = null;

  for (const combo of allCombos) {
    const result = evaluate5Cards(combo);
    if (best === null || result.score > best.score) {
      best = result;
    }
  }

  return best!;
}

/**
 * Compare two hands: returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareHands(a: HandResult, b: HandResult): number {
  return a.score - b.score;
}

/**
 * Find indices of winning hands from an array
 * Returns array of indices (multiple if tie/split pot)
 */
export function findWinners(hands: readonly HandResult[]): number[] {
  if (hands.length === 0) return [];

  let maxScore = -Infinity;
  for (const hand of hands) {
    if (hand.score > maxScore) {
      maxScore = hand.score;
    }
  }

  const winners: number[] = [];
  for (let i = 0; i < hands.length; i++) {
    if (hands[i]!.score === maxScore) {
      winners.push(i);
    }
  }

  return winners;
}

/**
 * Quick hand description for display
 */
export function getHandRankName(rank: HandRank): string {
  return HAND_RANK_NAMES[rank];
}
