/**
 * Bet types and resolution logic for ClawdVegas Craps
 * Designed for AI agent (clawdbot) integration
 */

import { type DicePair, getTotal, isPointNumber, type PointNumber } from './dice.js';
import { type GameState, isComingOut } from './state.js';

/** Bet resolution outcomes */
export type BetOutcome = 'won' | 'lost' | 'pushed' | 'active';

/** Base bet interface */
export interface Bet {
  readonly id: string;
  readonly type: BetType;
  readonly player: string;
  readonly amount: bigint;
  readonly placedAt: number;
}

/** All supported bet types */
export type BetType =
  | 'pass_line'
  | 'dont_pass'
  | 'come'
  | 'dont_come'
  | 'place_4'
  | 'place_5'
  | 'place_6'
  | 'place_8'
  | 'place_9'
  | 'place_10'
  | 'ce_craps'
  | 'ce_eleven';

/** Bet with tracking state */
export interface ActiveBet extends Bet {
  /** For come/don't come bets - their own point */
  readonly comePoint: PointNumber | null;
  /** Whether this is the first roll for come bets */
  readonly isFirstRoll: boolean;
}

/** Result of bet resolution */
export interface BetResolution {
  readonly bet: ActiveBet;
  readonly outcome: BetOutcome;
  readonly payout: bigint;
}

/**
 * Check if a bet type can be placed in the current game state
 */
export function canPlaceBet(state: GameState, betType: BetType): boolean {
  const isBettingOpen = state.phase === 'come_out_betting' || state.phase === 'point_set_betting';
  if (!isBettingOpen) return false;

  switch (betType) {
    // Pass/Don't Pass only during come-out
    case 'pass_line':
    case 'dont_pass':
      return state.phase === 'come_out_betting';

    // Come/Don't Come only after point is set
    case 'come':
    case 'dont_come':
      return state.phase === 'point_set_betting';

    // Place bets only after point is set
    case 'place_4':
    case 'place_5':
    case 'place_6':
    case 'place_8':
    case 'place_9':
    case 'place_10':
      return state.phase === 'point_set_betting';

    // C&E can be placed anytime bets are open
    case 'ce_craps':
    case 'ce_eleven':
      return true;

    default:
      return false;
  }
}

/**
 * Create a new bet
 */
export function createBet(
  player: string,
  betType: BetType,
  amount: bigint,
  id?: string
): ActiveBet {
  return {
    id: id ?? `${player}-${betType}-${Date.now()}`,
    type: betType,
    player,
    amount,
    placedAt: Date.now(),
    comePoint: null,
    isFirstRoll: betType === 'come' || betType === 'dont_come',
  };
}

/**
 * Resolve a Pass Line bet
 */
function resolvePassLine(bet: ActiveBet, dice: DicePair, state: GameState): BetResolution {
  const total = getTotal(dice);
  const comingOut = isComingOut(state);

  if (comingOut) {
    // Come-out roll
    if (total === 7 || total === 11) {
      return { bet, outcome: 'won', payout: bet.amount * 2n }; // 1:1 + original
    }
    if (total === 2 || total === 3 || total === 12) {
      return { bet, outcome: 'lost', payout: 0n };
    }
    // Point established - bet stays active
    return { bet, outcome: 'active', payout: 0n };
  } else {
    // Point phase
    if (total === state.point) {
      return { bet, outcome: 'won', payout: bet.amount * 2n };
    }
    if (total === 7) {
      return { bet, outcome: 'lost', payout: 0n };
    }
    return { bet, outcome: 'active', payout: 0n };
  }
}

/**
 * Resolve a Don't Pass bet
 */
function resolveDontPass(bet: ActiveBet, dice: DicePair, state: GameState): BetResolution {
  const total = getTotal(dice);
  const comingOut = isComingOut(state);

  if (comingOut) {
    // Come-out roll
    if (total === 2 || total === 3) {
      return { bet, outcome: 'won', payout: bet.amount * 2n };
    }
    if (total === 12) {
      // Bar-12: push (tie)
      return { bet, outcome: 'pushed', payout: bet.amount };
    }
    if (total === 7 || total === 11) {
      return { bet, outcome: 'lost', payout: 0n };
    }
    return { bet, outcome: 'active', payout: 0n };
  } else {
    // Point phase
    if (total === 7) {
      return { bet, outcome: 'won', payout: bet.amount * 2n };
    }
    if (total === state.point) {
      return { bet, outcome: 'lost', payout: 0n };
    }
    return { bet, outcome: 'active', payout: 0n };
  }
}

/**
 * Resolve a Come bet
 */
function resolveCome(bet: ActiveBet, dice: DicePair): BetResolution {
  const total = getTotal(dice);

  if (bet.isFirstRoll) {
    // First roll after placing come bet
    if (total === 7 || total === 11) {
      return { bet, outcome: 'won', payout: bet.amount * 2n };
    }
    if (total === 2 || total === 3 || total === 12) {
      return { bet, outcome: 'lost', payout: 0n };
    }
    // Establish come point
    if (isPointNumber(total)) {
      const updatedBet: ActiveBet = { ...bet, comePoint: total, isFirstRoll: false };
      return { bet: updatedBet, outcome: 'active', payout: 0n };
    }
  } else if (bet.comePoint !== null) {
    // Has a come point
    if (total === bet.comePoint) {
      return { bet, outcome: 'won', payout: bet.amount * 2n };
    }
    if (total === 7) {
      return { bet, outcome: 'lost', payout: 0n };
    }
  }

  return { bet, outcome: 'active', payout: 0n };
}

/**
 * Resolve a Don't Come bet
 */
function resolveDontCome(bet: ActiveBet, dice: DicePair): BetResolution {
  const total = getTotal(dice);

  if (bet.isFirstRoll) {
    if (total === 2 || total === 3) {
      return { bet, outcome: 'won', payout: bet.amount * 2n };
    }
    if (total === 12) {
      return { bet, outcome: 'pushed', payout: bet.amount };
    }
    if (total === 7 || total === 11) {
      return { bet, outcome: 'lost', payout: 0n };
    }
    if (isPointNumber(total)) {
      const updatedBet: ActiveBet = { ...bet, comePoint: total, isFirstRoll: false };
      return { bet: updatedBet, outcome: 'active', payout: 0n };
    }
  } else if (bet.comePoint !== null) {
    if (total === 7) {
      return { bet, outcome: 'won', payout: bet.amount * 2n };
    }
    if (total === bet.comePoint) {
      return { bet, outcome: 'lost', payout: 0n };
    }
  }

  return { bet, outcome: 'active', payout: 0n };
}

/**
 * Resolve a Place bet
 */
function resolvePlace(bet: ActiveBet, dice: DicePair, placeNumber: PointNumber): BetResolution {
  const total = getTotal(dice);

  if (total === placeNumber) {
    // Winner! Calculate payout based on number
    const payout = calculatePlacePayout(bet.amount, placeNumber);
    return { bet, outcome: 'won', payout };
  }
  if (total === 7) {
    return { bet, outcome: 'lost', payout: 0n };
  }
  return { bet, outcome: 'active', payout: 0n };
}

/**
 * Calculate place bet payout
 * 4/10: 9:5, 5/9: 7:5, 6/8: 7:6
 */
function calculatePlacePayout(amount: bigint, number: PointNumber): bigint {
  switch (number) {
    case 4:
    case 10:
      return amount + (amount * 9n) / 5n; // 9:5
    case 5:
    case 9:
      return amount + (amount * 7n) / 5n; // 7:5
    case 6:
    case 8:
      return amount + (amount * 7n) / 6n; // 7:6
  }
}

/**
 * Resolve C&E (Craps & Eleven) bet - one roll bet
 */
function resolveCE(bet: ActiveBet, dice: DicePair, isElevenPortion: boolean): BetResolution {
  const total = getTotal(dice);

  if (isElevenPortion) {
    // Eleven portion: wins 7:1 on 11
    if (total === 11) {
      return { bet, outcome: 'won', payout: bet.amount + bet.amount * 7n };
    }
  } else {
    // Craps portion: wins 7:1 on 2, 3, or 12
    if (total === 2 || total === 3 || total === 12) {
      return { bet, outcome: 'won', payout: bet.amount + bet.amount * 7n };
    }
  }

  // One-roll bet always resolves
  return { bet, outcome: 'lost', payout: 0n };
}

/**
 * Resolve a bet based on its type
 */
export function resolveBet(bet: ActiveBet, dice: DicePair, state: GameState): BetResolution {
  switch (bet.type) {
    case 'pass_line':
      return resolvePassLine(bet, dice, state);
    case 'dont_pass':
      return resolveDontPass(bet, dice, state);
    case 'come':
      return resolveCome(bet, dice);
    case 'dont_come':
      return resolveDontCome(bet, dice);
    case 'place_4':
      return resolvePlace(bet, dice, 4);
    case 'place_5':
      return resolvePlace(bet, dice, 5);
    case 'place_6':
      return resolvePlace(bet, dice, 6);
    case 'place_8':
      return resolvePlace(bet, dice, 8);
    case 'place_9':
      return resolvePlace(bet, dice, 9);
    case 'place_10':
      return resolvePlace(bet, dice, 10);
    case 'ce_craps':
      return resolveCE(bet, dice, false);
    case 'ce_eleven':
      return resolveCE(bet, dice, true);
    default:
      return { bet, outcome: 'active', payout: 0n };
  }
}

/**
 * Get human-readable bet type name (for Ace narrator)
 */
export function getBetTypeName(betType: BetType): string {
  const names: Record<BetType, string> = {
    pass_line: 'Pass Line',
    dont_pass: "Don't Pass",
    come: 'Come',
    dont_come: "Don't Come",
    place_4: 'Place 4',
    place_5: 'Place 5',
    place_6: 'Place 6',
    place_8: 'Place 8',
    place_9: 'Place 9',
    place_10: 'Place 10',
    ce_craps: 'Any Craps',
    ce_eleven: 'Yo-Eleven',
  };
  return names[betType];
}
