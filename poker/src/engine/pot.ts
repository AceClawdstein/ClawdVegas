/**
 * Pot management for Texas Molt'em
 * Handles main pot and side pots for all-in situations
 */

import { type HandResult, findWinners } from './hand-eval.js';

/** A pot that specific players are eligible for */
export interface Pot {
  readonly amount: bigint;
  readonly eligiblePlayers: readonly string[];  // Player addresses
}

/** Player contribution tracking for pot calculation */
export interface PlayerContribution {
  readonly address: string;
  readonly totalInvested: bigint;  // Total chips put in THIS hand
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
  readonly potDescription: string;  // "main pot", "side pot 1", etc.
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
export function calculatePots(contributions: readonly PlayerContribution[]): PotState {
  // Filter out folded players for pot eligibility, but their chips are still in
  const activePlayers = contributions.filter(p => !p.isFolded);

  if (activePlayers.length === 0) {
    // Everyone folded - shouldn't happen but handle it
    const totalFolded = contributions.reduce((sum, p) => sum + p.totalInvested, 0n);
    return {
      mainPot: { amount: totalFolded, eligiblePlayers: [] },
      sidePots: [],
      totalPot: totalFolded,
    };
  }

  // Get all distinct investment levels, sorted ascending
  const investmentLevels = [...new Set(contributions.map(p => p.totalInvested))]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const pots: Pot[] = [];
  let previousLevel = 0n;

  for (const level of investmentLevels) {
    if (level <= previousLevel) continue;

    const increment = level - previousLevel;

    // Who contributed at this level?
    const contributorsAtLevel = contributions.filter(p => p.totalInvested >= level);
    const potAmount = increment * BigInt(contributorsAtLevel.length);

    // Eligible players are non-folded contributors at this level
    const eligiblePlayers = contributorsAtLevel
      .filter(p => !p.isFolded)
      .map(p => p.address);

    if (potAmount > 0n) {
      pots.push({
        amount: potAmount,
        eligiblePlayers,
      });
    }

    previousLevel = level;
  }

  // First pot is main pot, rest are side pots
  const mainPot = pots[0] ?? { amount: 0n, eligiblePlayers: [] };
  const sidePots = pots.slice(1);
  const totalPot = pots.reduce((sum, p) => sum + p.amount, 0n);

  return { mainPot, sidePots, totalPot };
}

/**
 * Award pots to winners
 *
 * @param potState - The calculated pot state
 * @param hands - Map of player address to their evaluated hand
 * @param foldedPlayers - Set of addresses that have folded
 * @returns Array of awards (player, amount, pot description)
 */
export function awardPots(
  potState: PotState,
  hands: Map<string, HandResult>,
  foldedPlayers: Set<string>
): PotAward[] {
  const awards: PotAward[] = [];

  const allPots = [
    { pot: potState.mainPot, description: 'main pot' },
    ...potState.sidePots.map((pot, i) => ({ pot, description: `side pot ${i + 1}` })),
  ];

  for (const { pot, description } of allPots) {
    if (pot.amount === 0n) continue;

    // Get eligible, non-folded players who have hands
    const eligibleWithHands = pot.eligiblePlayers
      .filter(addr => !foldedPlayers.has(addr) && hands.has(addr));

    if (eligibleWithHands.length === 0) {
      // No one eligible (all folded) - pot goes to last non-folder
      // This shouldn't happen with proper game logic
      continue;
    }

    if (eligibleWithHands.length === 1) {
      // Only one player eligible - they win it all
      awards.push({
        address: eligibleWithHands[0]!,
        amount: pot.amount,
        potDescription: description,
      });
      continue;
    }

    // Multiple eligible players - compare hands
    const playerHands = eligibleWithHands.map(addr => hands.get(addr)!);
    const winnerIndices = findWinners(playerHands);

    // Split pot among winners
    const winnerCount = BigInt(winnerIndices.length);
    const splitAmount = pot.amount / winnerCount;
    const remainder = pot.amount % winnerCount;

    for (let i = 0; i < winnerIndices.length; i++) {
      const winnerAddr = eligibleWithHands[winnerIndices[i]!]!;
      // First winner gets any remainder (odd chip rule)
      const amount = i === 0 ? splitAmount + remainder : splitAmount;

      awards.push({
        address: winnerAddr,
        amount,
        potDescription: description,
      });
    }
  }

  return awards;
}

/**
 * Consolidate awards by player (sum up multiple pot wins)
 */
export function consolidateAwards(awards: readonly PotAward[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();

  for (const award of awards) {
    const current = totals.get(award.address) ?? 0n;
    totals.set(award.address, current + award.amount);
  }

  return totals;
}

/**
 * Quick check if any side pots exist
 */
export function hasSidePots(potState: PotState): boolean {
  return potState.sidePots.length > 0;
}

/**
 * Format pot for display
 */
export function formatPot(amount: bigint): string {
  const num = Number(amount);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toString();
}
