/**
 * Betting logic for No Limit Texas Hold'em
 * Handles valid actions, min/max raises, and betting round completion
 */

/** Player action types */
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';

/** A player action */
export interface PlayerAction {
  readonly type: ActionType;
  readonly amount: bigint;  // For bet/raise/all_in, this is the TOTAL bet amount
}

/** What actions are valid for the current player */
export interface ValidActions {
  readonly canFold: boolean;
  readonly canCheck: boolean;
  readonly canCall: boolean;
  readonly callAmount: bigint;
  readonly canBet: boolean;      // No one has bet yet this round
  readonly canRaise: boolean;    // Someone has bet, can raise
  readonly minBet: bigint;       // Minimum to open betting (big blind)
  readonly minRaise: bigint;     // Minimum total to raise to
  readonly maxBet: bigint;       // Player's stack (all-in)
}

/** Betting round state */
export interface BettingState {
  readonly currentBet: bigint;       // Current bet to call
  readonly minRaise: bigint;         // Min raise increment
  readonly lastRaiser: string | null; // Who last raised (for re-raise rules)
  readonly lastRaiseSize: bigint;    // Size of last raise
  readonly actedThisRound: Set<string>;  // Players who have acted
  readonly allInPlayers: Set<string>;    // Players who are all-in
}

/** Player state needed for betting decisions */
export interface BettingPlayer {
  readonly address: string;
  readonly stack: bigint;        // Chips remaining
  readonly currentBet: bigint;   // Amount already bet this round
  readonly isFolded: boolean;
  readonly isAllIn: boolean;
}

/**
 * Create initial betting state for a new betting round
 */
export function createBettingState(bigBlind: bigint): BettingState {
  return {
    currentBet: 0n,
    minRaise: bigBlind,
    lastRaiser: null,
    lastRaiseSize: bigBlind,
    actedThisRound: new Set(),
    allInPlayers: new Set(),
  };
}

/**
 * Create betting state after blinds are posted
 */
export function createBettingStateWithBlinds(bigBlind: bigint, bigBlindPlayer: string): BettingState {
  return {
    currentBet: bigBlind,
    minRaise: bigBlind,
    lastRaiser: bigBlindPlayer,
    lastRaiseSize: bigBlind,
    actedThisRound: new Set(),  // Blinds don't count as "acting"
    allInPlayers: new Set(),
  };
}

/**
 * Get valid actions for a player
 */
export function getValidActions(
  player: BettingPlayer,
  bettingState: BettingState,
  bigBlind: bigint
): ValidActions {
  const { currentBet, minRaise, lastRaiseSize } = bettingState;
  const toCall = currentBet - player.currentBet;

  // Can always fold (unless checking is free)
  const canFold = true;

  // Can check if no bet to call
  const canCheck = toCall === 0n;

  // Can call if there's a bet and player has chips (all-in call if short)
  const canCall = toCall > 0n && player.stack > 0n;
  const callAmount = toCall > player.stack ? player.stack : toCall;

  // Can bet if no one has bet yet
  const canBet = currentBet === 0n && player.stack >= bigBlind;

  // Can raise if someone has bet and we have chips beyond calling
  const minRaiseTotal = currentBet + lastRaiseSize;
  const canRaise = currentBet > 0n && player.stack > toCall;

  // Min/max betting amounts
  const minBetAmount = bigBlind;
  const minRaiseAmount = minRaiseTotal > player.stack + player.currentBet
    ? player.stack + player.currentBet  // All-in for less
    : minRaiseTotal;
  const maxBet = player.stack + player.currentBet;  // All-in

  return {
    canFold,
    canCheck,
    canCall,
    callAmount,
    canBet,
    canRaise,
    minBet: minBetAmount,
    minRaise: minRaiseAmount,
    maxBet,
  };
}

/**
 * Validate and normalize a player action
 * Returns normalized action or error
 */
export function validateAction(
  action: PlayerAction,
  player: BettingPlayer,
  validActions: ValidActions
): { valid: true; action: PlayerAction } | { valid: false; error: string } {
  switch (action.type) {
    case 'fold':
      return { valid: true, action };

    case 'check':
      if (!validActions.canCheck) {
        return { valid: false, error: 'Cannot check, must call or fold' };
      }
      return { valid: true, action: { type: 'check', amount: 0n } };

    case 'call':
      if (!validActions.canCall) {
        if (validActions.canCheck) {
          return { valid: false, error: 'No bet to call, use check' };
        }
        return { valid: false, error: 'Cannot afford to call' };
      }
      return { valid: true, action: { type: 'call', amount: validActions.callAmount } };

    case 'bet':
      if (!validActions.canBet) {
        return { valid: false, error: 'Cannot bet, must raise instead' };
      }
      if (action.amount < validActions.minBet && action.amount < player.stack) {
        return { valid: false, error: `Minimum bet is ${validActions.minBet}` };
      }
      if (action.amount > validActions.maxBet) {
        return { valid: false, error: `Maximum bet is ${validActions.maxBet} (your stack)` };
      }
      return { valid: true, action };

    case 'raise':
      if (!validActions.canRaise) {
        if (validActions.canBet) {
          return { valid: false, error: 'No bet to raise, use bet instead' };
        }
        return { valid: false, error: 'Cannot raise' };
      }
      // For raise, amount is the TOTAL bet, not the raise increment
      if (action.amount < validActions.minRaise && action.amount < validActions.maxBet) {
        return { valid: false, error: `Minimum raise is to ${validActions.minRaise}` };
      }
      if (action.amount > validActions.maxBet) {
        return { valid: false, error: `Maximum raise is ${validActions.maxBet} (all-in)` };
      }
      return { valid: true, action };

    case 'all_in':
      if (player.stack === 0n) {
        return { valid: false, error: 'Already all-in' };
      }
      return { valid: true, action: { type: 'all_in', amount: validActions.maxBet } };

    default:
      return { valid: false, error: `Unknown action type: ${(action as PlayerAction).type}` };
  }
}

/**
 * Apply action to betting state
 * Returns new betting state
 */
export function applyAction(
  action: PlayerAction,
  player: BettingPlayer,
  bettingState: BettingState
): BettingState {
  const newActed = new Set(bettingState.actedThisRound);
  newActed.add(player.address);

  let newAllIn = new Set(bettingState.allInPlayers);
  let newCurrentBet = bettingState.currentBet;
  let newLastRaiser = bettingState.lastRaiser;
  let newLastRaiseSize = bettingState.lastRaiseSize;

  switch (action.type) {
    case 'fold':
    case 'check':
    case 'call':
      // No changes to bet level
      break;

    case 'bet':
    case 'raise':
    case 'all_in': {
      const newTotal = action.amount;
      const raiseSize = newTotal - bettingState.currentBet;

      // Only count as raise if it increases the bet
      if (newTotal > newCurrentBet) {
        newCurrentBet = newTotal;
        newLastRaiser = player.address;
        // Only update min raise if this was a full raise (not short all-in)
        if (raiseSize >= bettingState.lastRaiseSize) {
          newLastRaiseSize = raiseSize;
        }
      }
      break;
    }
  }

  // Check if player is now all-in
  const totalBet = player.currentBet + action.amount;
  if (action.type === 'all_in' || (action.type !== 'fold' && action.type !== 'check' && totalBet >= player.stack + player.currentBet)) {
    newAllIn = new Set(newAllIn);
    newAllIn.add(player.address);
  }

  return {
    currentBet: newCurrentBet,
    minRaise: newLastRaiseSize,
    lastRaiser: newLastRaiser,
    lastRaiseSize: newLastRaiseSize,
    actedThisRound: newActed,
    allInPlayers: newAllIn,
  };
}

/**
 * Check if betting round is complete
 * Complete when all non-folded, non-all-in players have acted and bet amounts match
 */
export function isBettingRoundComplete(
  players: readonly BettingPlayer[],
  bettingState: BettingState
): boolean {
  const activePlayers = players.filter(p => !p.isFolded && !p.isAllIn);

  // If 0 or 1 active players, round is complete
  if (activePlayers.length <= 1) {
    return true;
  }

  // All active players must have acted
  for (const player of activePlayers) {
    if (!bettingState.actedThisRound.has(player.address)) {
      return false;
    }
  }

  // All active players must have matched the current bet
  for (const player of activePlayers) {
    if (player.currentBet < bettingState.currentBet) {
      return false;
    }
  }

  return true;
}

/**
 * Reset betting state for new round (after flop, turn, river)
 */
export function resetForNewRound(bettingState: BettingState, bigBlind: bigint): BettingState {
  return {
    currentBet: 0n,
    minRaise: bigBlind,
    lastRaiser: null,
    lastRaiseSize: bigBlind,
    actedThisRound: new Set(),
    allInPlayers: bettingState.allInPlayers, // All-in status persists
  };
}
