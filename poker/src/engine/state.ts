/**
 * Game state machine for Texas Molt'em
 * Manages hand phases and state transitions
 */

import { type Card, createDeck, shuffleDeck, dealHoleCards, dealCards } from './deck.js';
import { type BettingState, createBettingStateWithBlinds, resetForNewRound } from './betting.js';

/** Hand phases */
export type HandPhase =
  | 'waiting'           // Waiting for enough players
  | 'preflop'           // Hole cards dealt, first betting round
  | 'flop'              // 3 community cards, second betting round
  | 'turn'              // 4th community card, third betting round
  | 'river'             // 5th community card, final betting round
  | 'showdown'          // Determine winners
  | 'complete';         // Hand complete, ready for next

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
  readonly lastAction: { address: string; action: string; amount: bigint } | null;
  readonly actionDeadline: number | null;
}

/** Game events for logging/broadcast */
export type GameEvent =
  | { type: 'hand_started'; handNumber: number; button: number }
  | { type: 'hole_cards_dealt'; seatIndex: number; cards: Card[] }
  | { type: 'blinds_posted'; smallBlind: { seat: number; amount: bigint }; bigBlind: { seat: number; amount: bigint } }
  | { type: 'action_on'; seatIndex: number; deadline: number }
  | { type: 'player_acted'; seatIndex: number; action: string; amount: bigint; newStack: bigint }
  | { type: 'flop_dealt'; cards: Card[] }
  | { type: 'turn_dealt'; card: Card }
  | { type: 'river_dealt'; card: Card }
  | { type: 'showdown'; hands: Array<{ seatIndex: number; cards: Card[]; handName: string }> }
  | { type: 'pot_awarded'; winners: Array<{ seatIndex: number; amount: bigint }> }
  | { type: 'hand_complete' }
  | { type: 'phase_changed'; phase: HandPhase };

/** Result of a state transition */
export type TransitionResult =
  | { success: true; state: GameState; events: GameEvent[] }
  | { success: false; error: string };

/** Default table configuration */
export const DEFAULT_CONFIG: TableConfig = {
  tableId: 'moltem-1',
  smallBlind: 5000n,
  bigBlind: 10000n,
  minBuyIn: 200000n,
  maxBuyIn: 1000000n,
  maxSeats: 6,
  actionTimeoutMs: 30000,
};

/**
 * Create initial game state
 */
export function createInitialState(config: Partial<TableConfig> = {}): GameState {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    config: fullConfig,
    phase: 'waiting',
    handNumber: 0,
    seats: Array(fullConfig.maxSeats).fill(null),
    communityCards: [],
    deck: [],
    buttonPosition: 0,
    activePosition: -1,
    bettingState: createBettingStateWithBlinds(fullConfig.bigBlind, ''),
    lastAction: null,
    actionDeadline: null,
  };
}

/**
 * Get active (non-folded, seated) players
 */
export function getActivePlayers(state: GameState): Player[] {
  return state.seats.filter((s): s is Player => s !== null && !s.isFolded && !s.isSittingOut);
}

/**
 * Get players still in the hand (not folded)
 */
export function getPlayersInHand(state: GameState): Player[] {
  return state.seats.filter((s): s is Player => s !== null && !s.isFolded && s.holeCards !== null);
}

/**
 * Get players who can still act (not folded, not all-in)
 */
export function getPlayersWhoCanAct(state: GameState): Player[] {
  return getPlayersInHand(state).filter(p => !p.isAllIn);
}

/**
 * Find next position to act (clockwise from current)
 */
export function findNextActivePosition(state: GameState, fromPosition: number): number {
  const players = getPlayersWhoCanAct(state);
  if (players.length === 0) return -1;

  for (let i = 1; i <= state.config.maxSeats; i++) {
    const pos = (fromPosition + i) % state.config.maxSeats;
    const player = state.seats[pos];
    if (player && !player.isFolded && !player.isAllIn && !player.isSittingOut) {
      return pos;
    }
  }

  return -1;
}

/**
 * Get small blind position (left of button)
 */
export function getSmallBlindPosition(state: GameState): number {
  return findNextActivePosition(state, state.buttonPosition);
}

/**
 * Get big blind position (left of small blind)
 */
export function getBigBlindPosition(state: GameState): number {
  const sbPos = getSmallBlindPosition(state);
  return findNextActivePosition(state, sbPos);
}

/**
 * Get first to act preflop (left of big blind)
 */
export function getFirstToActPreflop(state: GameState): number {
  const bbPos = getBigBlindPosition(state);
  return findNextActivePosition(state, bbPos);
}

/**
 * Get first to act postflop (left of button)
 */
export function getFirstToActPostflop(state: GameState): number {
  return findNextActivePosition(state, state.buttonPosition);
}

/**
 * Check if enough players to start a hand
 */
export function canStartHand(state: GameState): boolean {
  const activePlayers = state.seats.filter(
    (s): s is Player => s !== null && !s.isSittingOut && s.stack > 0n
  );
  return activePlayers.length >= 2;
}

/**
 * Start a new hand
 */
export function startHand(state: GameState): TransitionResult {
  if (!canStartHand(state)) {
    return { success: false, error: 'Not enough players to start hand' };
  }

  const events: GameEvent[] = [];
  const handNumber = state.handNumber + 1;

  // Move button
  let newButton = state.buttonPosition;
  if (handNumber > 1) {
    newButton = findNextActivePosition(state, state.buttonPosition);
  } else {
    // First hand - find first occupied seat
    for (let i = 0; i < state.config.maxSeats; i++) {
      if (state.seats[i] && !state.seats[i]!.isSittingOut) {
        newButton = i;
        break;
      }
    }
  }

  // Create new state with button moved
  let newState: GameState = {
    ...state,
    handNumber,
    buttonPosition: newButton,
    phase: 'preflop',
    communityCards: [],
    lastAction: null,
  };

  events.push({ type: 'hand_started', handNumber, button: newButton });

  // Shuffle and deal
  const deck = shuffleDeck(createDeck());
  const activePlayers = getActivePlayers(newState);
  const { hands, remaining } = dealHoleCards(deck, activePlayers.length);

  // Assign hole cards to players
  const newSeats = [...newState.seats];
  let handIdx = 0;
  for (let i = 0; i < newSeats.length; i++) {
    const seat = newSeats[i];
    if (seat && !seat.isSittingOut) {
      newSeats[i] = {
        ...seat,
        holeCards: hands[handIdx]!,
        currentBet: 0n,
        totalInvested: 0n,
        isFolded: false,
        isAllIn: false,
      };
      events.push({ type: 'hole_cards_dealt', seatIndex: i, cards: hands[handIdx]! });
      handIdx++;
    }
  }

  newState = { ...newState, seats: newSeats, deck: remaining };

  // Post blinds
  const sbPos = getSmallBlindPosition(newState);
  const bbPos = getBigBlindPosition(newState);
  const sbPlayer = newState.seats[sbPos]!;
  const bbPlayer = newState.seats[bbPos]!;

  const sbAmount = sbPlayer.stack < newState.config.smallBlind ? sbPlayer.stack : newState.config.smallBlind;
  const bbAmount = bbPlayer.stack < newState.config.bigBlind ? bbPlayer.stack : newState.config.bigBlind;

  const seatsWithBlinds = [...newState.seats];
  seatsWithBlinds[sbPos] = {
    ...sbPlayer,
    stack: sbPlayer.stack - sbAmount,
    currentBet: sbAmount,
    totalInvested: sbAmount,
    isAllIn: sbPlayer.stack === sbAmount,
  };
  seatsWithBlinds[bbPos] = {
    ...bbPlayer,
    stack: bbPlayer.stack - bbAmount,
    currentBet: bbAmount,
    totalInvested: bbAmount,
    isAllIn: bbPlayer.stack === bbAmount,
  };

  events.push({
    type: 'blinds_posted',
    smallBlind: { seat: sbPos, amount: sbAmount },
    bigBlind: { seat: bbPos, amount: bbAmount },
  });

  // Set up betting state
  const bettingState = createBettingStateWithBlinds(bbAmount, bbPlayer.address);

  // Find first to act
  const activePos = getFirstToActPreflop({ ...newState, seats: seatsWithBlinds });
  const deadline = Date.now() + newState.config.actionTimeoutMs;

  events.push({ type: 'action_on', seatIndex: activePos, deadline });
  events.push({ type: 'phase_changed', phase: 'preflop' });

  return {
    success: true,
    state: {
      ...newState,
      seats: seatsWithBlinds,
      bettingState,
      activePosition: activePos,
      actionDeadline: deadline,
    },
    events,
  };
}

/**
 * Deal community cards for next phase
 */
export function dealCommunityCards(state: GameState): TransitionResult {
  const events: GameEvent[] = [];
  let newPhase: HandPhase;
  let newCommunity: Card[];
  let newDeck: Card[];

  switch (state.phase) {
    case 'preflop': {
      // Deal flop (3 cards, burn 1)
      const { dealt: burn1, remaining: afterBurn } = dealCards(state.deck, 1);
      const { dealt: flop, remaining } = dealCards(afterBurn, 3);
      newCommunity = flop;
      newDeck = remaining;
      newPhase = 'flop';
      events.push({ type: 'flop_dealt', cards: flop });
      break;
    }
    case 'flop': {
      // Deal turn (1 card, burn 1)
      const { dealt: burn1, remaining: afterBurn } = dealCards(state.deck, 1);
      const { dealt: turn, remaining } = dealCards(afterBurn, 1);
      newCommunity = [...state.communityCards, turn[0]!];
      newDeck = remaining;
      newPhase = 'turn';
      events.push({ type: 'turn_dealt', card: turn[0]! });
      break;
    }
    case 'turn': {
      // Deal river (1 card, burn 1)
      const { dealt: burn1, remaining: afterBurn } = dealCards(state.deck, 1);
      const { dealt: river, remaining } = dealCards(afterBurn, 1);
      newCommunity = [...state.communityCards, river[0]!];
      newDeck = remaining;
      newPhase = 'river';
      events.push({ type: 'river_dealt', card: river[0]! });
      break;
    }
    default:
      return { success: false, error: `Cannot deal community cards in phase ${state.phase}` };
  }

  // Reset betting for new round
  const newBettingState = resetForNewRound(state.bettingState, state.config.bigBlind);

  // Reset player current bets
  const newSeats = state.seats.map(seat => {
    if (!seat) return null;
    return { ...seat, currentBet: 0n };
  });

  // Find first to act
  const firstToAct = getFirstToActPostflop({ ...state, seats: newSeats });
  const deadline = firstToAct >= 0 ? Date.now() + state.config.actionTimeoutMs : null;

  if (firstToAct >= 0) {
    events.push({ type: 'action_on', seatIndex: firstToAct, deadline: deadline! });
  }
  events.push({ type: 'phase_changed', phase: newPhase });

  return {
    success: true,
    state: {
      ...state,
      phase: newPhase,
      communityCards: newCommunity,
      deck: newDeck,
      seats: newSeats,
      bettingState: newBettingState,
      activePosition: firstToAct,
      actionDeadline: deadline,
    },
    events,
  };
}

/**
 * Check if hand should go to showdown
 */
export function shouldGoToShowdown(state: GameState): boolean {
  const playersInHand = getPlayersInHand(state);
  return state.phase === 'river' || playersInHand.length <= 1;
}

/**
 * Check if all remaining players are all-in
 */
export function allPlayersAllIn(state: GameState): boolean {
  const playersWhoCanAct = getPlayersWhoCanAct(state);
  return playersWhoCanAct.length === 0 && getPlayersInHand(state).length > 1;
}
