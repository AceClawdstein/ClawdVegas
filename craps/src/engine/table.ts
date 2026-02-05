/**
 * CrapsTable - Main game orchestrator for ClawdVegas
 * Optimized for clawdbot (AI agent) integration
 */

import { EventEmitter } from 'events';
import { rollDice, getTotal, type DicePair } from './dice.js';
import {
  createInitialState,
  addPlayer,
  removePlayer,
  processRoll,
  closeBetting,
  canPlaceBets,
  type GameState,
  type GameEvent,
} from './state.js';
import {
  createBet,
  resolveBet,
  canPlaceBet,
  getBetTypeName,
  type ActiveBet,
  type BetType,
  type BetResolution,
} from './bets.js';

/** Table configuration */
export interface TableConfig {
  readonly minBet: bigint;
  readonly maxBet: bigint;
  readonly maxPlayers: number;
}

/** Default table configuration */
export const DEFAULT_CONFIG: TableConfig = {
  minBet: 10000n,      // 10K tokens
  maxBet: 1000000n,    // 1M tokens
  maxPlayers: 10,
};

/** Events emitted by the table */
export interface TableEvents {
  player_joined: { address: string; playerCount: number };
  player_left: { address: string; playerCount: number };
  bet_placed: { bet: ActiveBet; betTypeName: string };
  dice_rolled: { dice: DicePair; total: number; shooter: string };
  bet_resolved: { resolution: BetResolution };
  phase_changed: { phase: string; point: number | null };
  shooter_changed: { shooter: string | null };
  ace_says: { message: string };
}

/** Result of a table action */
export type TableResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * CrapsTable - The main game controller
 *
 * Clawdbot Integration:
 * - join(address) to enter the table
 * - placeBet(address, betType, amount) to place bets
 * - roll(address) to roll dice (if you're the shooter)
 * - getState() to see current game state
 * - Subscribe to events for real-time updates
 */
export class CrapsTable extends EventEmitter {
  private state: GameState;
  private bets: Map<string, ActiveBet>;
  private readonly config: TableConfig;

  constructor(config: Partial<TableConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = createInitialState();
    this.bets = new Map();
  }

  /**
   * Get current game state (for clawdbot decision making)
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * Get all active bets
   */
  getActiveBets(): ActiveBet[] {
    return Array.from(this.bets.values());
  }

  /**
   * Get bets for a specific player
   */
  getPlayerBets(address: string): ActiveBet[] {
    return Array.from(this.bets.values()).filter(b => b.player === address);
  }

  /**
   * Get table configuration
   */
  getConfig(): TableConfig {
    return this.config;
  }

  /**
   * Join the table
   */
  join(address: string): TableResult<{ position: number }> {
    if (this.state.players.length >= this.config.maxPlayers) {
      return { success: false, error: `Table full (max ${this.config.maxPlayers} players)` };
    }

    const result = addPlayer(this.state, address);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    this.state = result.state;
    const position = this.state.players.findIndex(p => p.address === address);

    this.emit('player_joined', {
      address,
      playerCount: this.state.players.length,
    });

    this.emitPhaseChange();

    if (this.state.shooter === address) {
      this.emit('shooter_changed', { shooter: address });
      this.emit('ace_says', { message: `Welcome to the table, ${this.shortAddr(address)}! You're up to shoot!` });
    } else {
      this.emit('ace_says', { message: `${this.shortAddr(address)} joins the table. Let's roll!` });
    }

    return { success: true, data: { position } };
  }

  /**
   * Leave the table
   */
  leave(address: string): TableResult<{ refundedBets: ActiveBet[] }> {
    // Collect player's active bets for refund
    const playerBets = this.getPlayerBets(address);

    const result = removePlayer(this.state, address);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    this.state = result.state;

    // Remove player's bets
    for (const bet of playerBets) {
      this.bets.delete(bet.id);
    }

    this.emit('player_left', {
      address,
      playerCount: this.state.players.length,
    });

    this.emitPhaseChange();

    return { success: true, data: { refundedBets: playerBets } };
  }

  /**
   * Place a bet
   */
  placeBet(address: string, betType: BetType, amount: bigint): TableResult<{ bet: ActiveBet }> {
    // Validate player is at table
    if (!this.state.players.some(p => p.address === address)) {
      return { success: false, error: 'Player not at table' };
    }

    // Validate betting is open
    if (!canPlaceBets(this.state)) {
      return { success: false, error: `Betting closed during ${this.state.phase}` };
    }

    // Validate bet type for current phase
    if (!canPlaceBet(this.state, betType)) {
      return { success: false, error: `Cannot place ${betType} bet in ${this.state.phase}` };
    }

    // Validate amount
    if (amount < this.config.minBet) {
      return { success: false, error: `Minimum bet is ${this.config.minBet}` };
    }
    if (amount > this.config.maxBet) {
      return { success: false, error: `Maximum bet is ${this.config.maxBet}` };
    }

    const bet = createBet(address, betType, amount);
    this.bets.set(bet.id, bet);

    const betTypeName = getBetTypeName(betType);
    this.emit('bet_placed', { bet, betTypeName });
    this.emit('ace_says', {
      message: `${this.shortAddr(address)} drops ${this.formatAmount(amount)} on ${betTypeName}!`
    });

    return { success: true, data: { bet } };
  }

  /**
   * Roll the dice (shooter only)
   */
  roll(address: string): TableResult<{ dice: DicePair; resolutions: BetResolution[] }> {
    // Validate caller is shooter
    if (this.state.shooter !== address) {
      return { success: false, error: 'Not the shooter' };
    }

    // Validate we can roll
    if (this.state.phase !== 'come_out_betting' && this.state.phase !== 'point_set_betting') {
      return { success: false, error: `Cannot roll in ${this.state.phase}` };
    }

    // Close betting
    const closeResult = closeBetting(this.state);
    if (!closeResult.success) {
      return { success: false, error: closeResult.error };
    }
    this.state = closeResult.state;

    // Roll the dice
    const dice = rollDice();
    const total = getTotal(dice);

    this.emit('dice_rolled', { dice, total, shooter: address });

    // Process roll in state machine
    const rollResult = processRoll(this.state, dice);
    if (!rollResult.success) {
      return { success: false, error: rollResult.error };
    }
    this.state = rollResult.state;

    // Resolve all bets
    const resolutions = this.resolveAllBets(dice);

    // Emit appropriate Ace commentary
    this.emitRollCommentary(dice, total, rollResult.event, resolutions);

    this.emitPhaseChange();

    // Check for shooter change
    if (rollResult.event.type === 'seven_out') {
      this.emit('shooter_changed', { shooter: this.state.shooter });
    }

    return { success: true, data: { dice, resolutions } };
  }

  /**
   * Resolve all active bets after a roll
   */
  private resolveAllBets(dice: DicePair): BetResolution[] {
    const resolutions: BetResolution[] = [];
    const remainingBets = new Map<string, ActiveBet>();

    for (const [id, bet] of this.bets) {
      const resolution = resolveBet(bet, dice, this.state);
      resolutions.push(resolution);

      if (resolution.outcome === 'active') {
        // Bet stays active (may have updated come point)
        remainingBets.set(id, resolution.bet);
      } else {
        // Bet resolved
        this.emit('bet_resolved', { resolution });
      }
    }

    this.bets = remainingBets;
    return resolutions;
  }

  /**
   * Emit phase change event
   */
  private emitPhaseChange(): void {
    this.emit('phase_changed', {
      phase: this.state.phase,
      point: this.state.point,
    });
  }

  /**
   * Emit Ace's commentary based on roll outcome
   */
  private emitRollCommentary(
    dice: DicePair,
    total: number,
    event: GameEvent,
    resolutions: BetResolution[]
  ): void {
    const winners = resolutions.filter(r => r.outcome === 'won');
    const totalWon = winners.reduce((sum, r) => sum + r.payout, 0n);

    let message: string;

    switch (event.type) {
      case 'natural':
        message = total === 7
          ? `SEVEN! Front line winner! ${winners.length} bets pay out!`
          : `YO-ELEVEN! Natural winner!`;
        break;
      case 'craps':
        message = total === 2
          ? `Snake eyes! Craps! Don't Pass wins!`
          : total === 12
          ? `Boxcars! Twelve craps! Bar the Don'ts!`
          : `ACE-DEUCE! Three craps!`;
        break;
      case 'point_established':
        message = `Point is ${event.point}! Mark it! Good luck, shooter!`;
        break;
      case 'point_hit':
        message = `WINNER! ${event.point} the hard way! Point is made! New shooter coming out!`;
        break;
      case 'seven_out':
        message = `SEVEN OUT! Line away! New shooter coming out!`;
        break;
      default:
        message = `${total}! ${dice[0]}-${dice[1]}! No field, no harm!`;
    }

    if (totalWon > 0n) {
      message += ` Paying ${this.formatAmount(totalWon)} to the winners!`;
    }

    this.emit('ace_says', { message });
  }

  /**
   * Format address for display
   */
  private shortAddr(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Format token amount for display
   */
  private formatAmount(amount: bigint): string {
    const num = Number(amount);
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toString();
  }
}

/**
 * Create a new craps table instance
 */
export function createTable(config?: Partial<TableConfig>): CrapsTable {
  return new CrapsTable(config);
}
