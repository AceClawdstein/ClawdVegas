/**
 * Game state machine for ClawdVegas Craps
 * Manages the flow of the craps game through its various phases
 */

import { type DicePair, getTotal, isPoint, type PointNumber, isPointNumber } from './dice.js';

/** All possible game phases */
export type GamePhase =
  | 'waiting_for_shooter'
  | 'come_out_betting'
  | 'come_out_roll'
  | 'point_set_betting'
  | 'point_roll';

/** Player information */
export interface Player {
  readonly address: string;
  readonly joinedAt: number;
}

/** The complete game state */
export interface GameState {
  /** Current phase of the game */
  readonly phase: GamePhase;
  /** The point number if one is set, null otherwise */
  readonly point: PointNumber | null;
  /** Current shooter's address, null if no shooter */
  readonly shooter: string | null;
  /** Queue of players waiting to shoot (in order) */
  readonly shooterQueue: readonly string[];
  /** All players at the table */
  readonly players: readonly Player[];
  /** Last roll result, null if no rolls yet */
  readonly lastRoll: DicePair | null;
  /** Number of rolls in current shooter's turn */
  readonly rollCount: number;
}

/** Result of a state transition */
export type TransitionResult =
  | { success: true; state: GameState; event: GameEvent }
  | { success: false; error: string };

/** Events emitted during game state changes */
export type GameEvent =
  | { type: 'shooter_assigned'; shooter: string }
  | { type: 'bets_open'; phase: 'come_out' | 'point' }
  | { type: 'dice_rolled'; dice: DicePair; total: number }
  | { type: 'point_established'; point: PointNumber }
  | { type: 'point_hit'; point: PointNumber }
  | { type: 'seven_out'; shooter: string }
  | { type: 'natural'; total: 7 | 11 }
  | { type: 'craps'; total: 2 | 3 | 12 }
  | { type: 'player_joined'; address: string }
  | { type: 'player_left'; address: string }
  | { type: 'shooter_changed'; newShooter: string | null };

/**
 * Create the initial game state
 */
export function createInitialState(): GameState {
  return {
    phase: 'waiting_for_shooter',
    point: null,
    shooter: null,
    shooterQueue: [],
    players: [],
    lastRoll: null,
    rollCount: 0,
  };
}

/**
 * Add a player to the table
 */
export function addPlayer(state: GameState, address: string): TransitionResult {
  // Check if player already at table
  if (state.players.some(p => p.address === address)) {
    return { success: false, error: 'Player already at table' };
  }

  const newPlayer: Player = {
    address,
    joinedAt: Date.now(),
  };

  const newState: GameState = {
    ...state,
    players: [...state.players, newPlayer],
    shooterQueue: [...state.shooterQueue, address],
  };

  // If waiting for shooter and this is first player, transition
  if (state.phase === 'waiting_for_shooter' && state.players.length === 0) {
    return assignShooter({
      ...newState,
    });
  }

  return {
    success: true,
    state: newState,
    event: { type: 'player_joined', address },
  };
}

/**
 * Remove a player from the table
 */
export function removePlayer(state: GameState, address: string): TransitionResult {
  const playerIndex = state.players.findIndex(p => p.address === address);
  if (playerIndex === -1) {
    return { success: false, error: 'Player not at table' };
  }

  const newPlayers = state.players.filter(p => p.address !== address);
  const newQueue = state.shooterQueue.filter(a => a !== address);

  let newState: GameState = {
    ...state,
    players: newPlayers,
    shooterQueue: newQueue,
  };

  // If shooter is leaving, rotate to next shooter
  if (state.shooter === address) {
    const nextShooter = newQueue[0] ?? null;
    newState = {
      ...newState,
      shooter: nextShooter,
      phase: nextShooter ? 'come_out_betting' : 'waiting_for_shooter',
      point: null,
      rollCount: 0,
    };
  }

  return {
    success: true,
    state: newState,
    event: { type: 'player_left', address },
  };
}

/**
 * Assign the next shooter from the queue
 */
function assignShooter(state: GameState): TransitionResult {
  if (state.shooterQueue.length === 0) {
    return {
      success: true,
      state: { ...state, phase: 'waiting_for_shooter', shooter: null },
      event: { type: 'shooter_changed', newShooter: null },
    };
  }

  const [nextShooter, ...remainingQueue] = state.shooterQueue;
  if (nextShooter === undefined) {
    return { success: false, error: 'No shooter available' };
  }

  return {
    success: true,
    state: {
      ...state,
      shooter: nextShooter,
      shooterQueue: [...remainingQueue, nextShooter], // Rotate to back of queue
      phase: 'come_out_betting',
      point: null,
      rollCount: 0,
    },
    event: { type: 'shooter_assigned', shooter: nextShooter },
  };
}

/**
 * Open betting phase
 */
export function openBetting(state: GameState): TransitionResult {
  if (state.phase === 'come_out_roll') {
    return {
      success: true,
      state: { ...state, phase: 'come_out_betting' },
      event: { type: 'bets_open', phase: 'come_out' },
    };
  }

  if (state.phase === 'point_roll') {
    return {
      success: true,
      state: { ...state, phase: 'point_set_betting' },
      event: { type: 'bets_open', phase: 'point' },
    };
  }

  return { success: false, error: `Cannot open betting from phase: ${state.phase}` };
}

/**
 * Close betting and prepare for roll
 */
export function closeBetting(state: GameState): TransitionResult {
  if (state.phase === 'come_out_betting') {
    return {
      success: true,
      state: { ...state, phase: 'come_out_roll' },
      event: { type: 'bets_open', phase: 'come_out' }, // Simplified event
    };
  }

  if (state.phase === 'point_set_betting') {
    return {
      success: true,
      state: { ...state, phase: 'point_roll' },
      event: { type: 'bets_open', phase: 'point' }, // Simplified event
    };
  }

  return { success: false, error: `Cannot close betting from phase: ${state.phase}` };
}

/**
 * Process a dice roll and update game state
 */
export function processRoll(state: GameState, dice: DicePair): TransitionResult {
  // Validate we're in a rolling phase
  if (state.phase !== 'come_out_roll' && state.phase !== 'point_roll') {
    return { success: false, error: `Cannot roll in phase: ${state.phase}` };
  }

  const total = getTotal(dice);
  const isComingOut = state.phase === 'come_out_roll';

  const baseState: GameState = {
    ...state,
    lastRoll: dice,
    rollCount: state.rollCount + 1,
  };

  if (isComingOut) {
    return processComeOutRoll(baseState, dice, total);
  } else {
    return processPointRoll(baseState, dice, total);
  }
}

/**
 * Process a come-out roll
 */
function processComeOutRoll(state: GameState, dice: DicePair, total: number): TransitionResult {
  // Natural (7 or 11) - Pass wins, Don't Pass loses
  if (total === 7 || total === 11) {
    return {
      success: true,
      state: { ...state, phase: 'come_out_betting' },
      event: { type: 'natural', total: total as 7 | 11 },
    };
  }

  // Craps (2, 3, 12) - Pass loses, Don't Pass wins (except 12 is push)
  if (total === 2 || total === 3 || total === 12) {
    return {
      success: true,
      state: { ...state, phase: 'come_out_betting' },
      event: { type: 'craps', total: total as 2 | 3 | 12 },
    };
  }

  // Point is established (4, 5, 6, 8, 9, 10)
  if (isPoint(dice) && isPointNumber(total)) {
    return {
      success: true,
      state: { ...state, phase: 'point_set_betting', point: total },
      event: { type: 'point_established', point: total },
    };
  }

  // Should never reach here
  return { success: false, error: `Unexpected come-out total: ${total}` };
}

/**
 * Process a point roll
 */
function processPointRoll(state: GameState, dice: DicePair, total: number): TransitionResult {
  if (state.point === null) {
    return { success: false, error: 'No point set during point roll' };
  }

  // Point is hit - Pass wins
  if (total === state.point) {
    return {
      success: true,
      state: { ...state, phase: 'come_out_betting', point: null },
      event: { type: 'point_hit', point: state.point },
    };
  }

  // Seven-out - Pass loses, Don't Pass wins, shooter rotates
  if (total === 7) {
    const [, ...remainingQueue] = state.shooterQueue;
    const nextShooter = remainingQueue[0] ?? null;

    return {
      success: true,
      state: {
        ...state,
        phase: nextShooter ? 'come_out_betting' : 'waiting_for_shooter',
        point: null,
        shooter: nextShooter,
        shooterQueue: remainingQueue,
        rollCount: 0,
      },
      event: { type: 'seven_out', shooter: state.shooter ?? '' },
    };
  }

  // Any other number - continue rolling
  return {
    success: true,
    state: { ...state, phase: 'point_set_betting' },
    event: { type: 'dice_rolled', dice, total },
  };
}

/**
 * Shooter passes the dice voluntarily
 */
export function passDice(state: GameState, shooter: string): TransitionResult {
  if (state.shooter !== shooter) {
    return { success: false, error: 'Not the current shooter' };
  }

  if (state.phase !== 'come_out_betting' && state.phase !== 'point_set_betting') {
    return { success: false, error: 'Cannot pass dice during a roll' };
  }

  // Remove from front of queue, add to back
  const queue = state.shooterQueue.filter(a => a !== shooter);
  const newQueue = [...queue, shooter];
  const nextShooter = queue[0] ?? null;

  return {
    success: true,
    state: {
      ...state,
      shooter: nextShooter,
      shooterQueue: newQueue,
      phase: nextShooter ? 'come_out_betting' : 'waiting_for_shooter',
      point: null,
      rollCount: 0,
    },
    event: { type: 'shooter_changed', newShooter: nextShooter },
  };
}

/**
 * Check if bets can be placed in current phase
 */
export function canPlaceBets(state: GameState): boolean {
  return state.phase === 'come_out_betting' || state.phase === 'point_set_betting';
}

/**
 * Check if the game is in come-out phase
 */
export function isComingOut(state: GameState): boolean {
  return state.phase === 'come_out_betting' || state.phase === 'come_out_roll';
}
