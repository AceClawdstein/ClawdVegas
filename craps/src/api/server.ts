/**
 * HTTP API Server for ClawdVegas Craps
 * Optimized for clawdbot (AI agent) integration
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { createTable } from '../engine/table.js';
import { type BetType } from '../engine/bets.js';

const app = express();
app.use(express.json());

// Create the game table
const table = createTable();

// Store for tracking clawdbot sessions (simple in-memory for MVP)
const sessions = new Map<string, { address: string; lastSeen: number }>();

/**
 * Middleware to log requests (useful for clawdbot debugging)
 */
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', game: 'ClawdVegas Craps', version: '1.0.0' });
});

/**
 * GET /api/table/state
 * Get current game state (public - no auth required)
 * Clawdbots use this to observe and make decisions
 */
app.get('/api/table/state', (_req: Request, res: Response) => {
  const state = table.getState();
  const bets = table.getActiveBets();
  const config = table.getConfig();

  res.json({
    phase: state.phase,
    point: state.point,
    shooter: state.shooter,
    players: state.players.map(p => p.address),
    playerCount: state.players.length,
    lastRoll: state.lastRoll,
    rollCount: state.rollCount,
    activeBets: bets.length,
    config: {
      minBet: config.minBet.toString(),
      maxBet: config.maxBet.toString(),
      maxPlayers: config.maxPlayers,
    },
  });
});

/**
 * GET /api/table/bets
 * Get all active bets
 */
app.get('/api/table/bets', (_req: Request, res: Response) => {
  const bets = table.getActiveBets();
  res.json({
    bets: bets.map(b => ({
      id: b.id,
      type: b.type,
      player: b.player,
      amount: b.amount.toString(),
      comePoint: b.comePoint,
    })),
  });
});

/**
 * POST /api/table/join
 * Join the table
 * Body: { address: string }
 */
app.post('/api/table/join', (req: Request, res: Response) => {
  const { address } = req.body as { address?: string };

  if (!address || typeof address !== 'string') {
    res.status(400).json({ error: 'Missing address' });
    return;
  }

  const result = table.join(address);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Track session
  sessions.set(address, { address, lastSeen: Date.now() });

  res.json({
    success: true,
    position: result.data.position,
    state: table.getState(),
  });
});

/**
 * POST /api/table/leave
 * Leave the table
 * Body: { address: string }
 */
app.post('/api/table/leave', (req: Request, res: Response) => {
  const { address } = req.body as { address?: string };

  if (!address) {
    res.status(400).json({ error: 'Missing address' });
    return;
  }

  const result = table.leave(address);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  sessions.delete(address);

  res.json({
    success: true,
    refundedBets: result.data.refundedBets.map(b => ({
      id: b.id,
      type: b.type,
      amount: b.amount.toString(),
    })),
  });
});

/**
 * POST /api/bet/place
 * Place a bet
 * Body: { address: string, betType: BetType, amount: string }
 */
app.post('/api/bet/place', (req: Request, res: Response) => {
  const { address, betType, amount } = req.body as {
    address?: string;
    betType?: string;
    amount?: string;
  };

  if (!address || !betType || !amount) {
    res.status(400).json({ error: 'Missing address, betType, or amount' });
    return;
  }

  let amountBigInt: bigint;
  try {
    amountBigInt = BigInt(amount);
  } catch {
    res.status(400).json({ error: 'Invalid amount - must be numeric string' });
    return;
  }

  const result = table.placeBet(address, betType as BetType, amountBigInt);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    bet: {
      id: result.data.bet.id,
      type: result.data.bet.type,
      amount: result.data.bet.amount.toString(),
    },
  });
});

/**
 * POST /api/shooter/roll
 * Roll the dice (must be current shooter)
 * Body: { address: string }
 */
app.post('/api/shooter/roll', (req: Request, res: Response) => {
  const { address } = req.body as { address?: string };

  if (!address) {
    res.status(400).json({ error: 'Missing address' });
    return;
  }

  const result = table.roll(address);

  if (!result.success) {
    res.status(403).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    dice: result.data.dice,
    total: result.data.dice[0] + result.data.dice[1],
    resolutions: result.data.resolutions.map(r => ({
      betId: r.bet.id,
      betType: r.bet.type,
      player: r.bet.player,
      outcome: r.outcome,
      payout: r.payout.toString(),
    })),
    newState: {
      phase: table.getState().phase,
      point: table.getState().point,
      shooter: table.getState().shooter,
    },
  });
});

/**
 * GET /api/player/:address/bets
 * Get a specific player's bets
 */
app.get('/api/player/:address/bets', (req: Request, res: Response) => {
  const address = req.params.address ?? '';

  const bets = table.getPlayerBets(address);
  res.json({
    address,
    bets: bets.map(b => ({
      id: b.id,
      type: b.type,
      amount: b.amount.toString(),
      comePoint: b.comePoint,
    })),
  });
});

// Event logging for debugging
table.on('ace_says', (data: { message: string }) => {
  console.log(`🦞 Ace: ${data.message}`);
});

table.on('dice_rolled', (data: { dice: [number, number]; total: number }) => {
  console.log(`🎲 Rolled: ${data.dice[0]}-${data.dice[1]} = ${data.total}`);
});

table.on('bet_resolved', (data: { resolution: { outcome: string; bet: { type: string }; payout: bigint } }) => {
  const symbol = data.resolution.outcome === 'won' ? '✅' : data.resolution.outcome === 'lost' ? '❌' : '🔄';
  console.log(`${symbol} ${data.resolution.bet.type}: ${data.resolution.outcome} (payout: ${data.resolution.payout})`);
});

export { app, table };

/**
 * Start the server
 */
export function startServer(port: number = 3000): void {
  app.listen(port, () => {
    console.log(`
🦞 ClawdVegas Craps Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Server running on http://localhost:${port}

  Clawdbot API Endpoints:
  ─────────────────────────────────────────────────
  GET  /api/health         Health check
  GET  /api/table/state    Get game state
  GET  /api/table/bets     Get all active bets
  POST /api/table/join     Join table { address }
  POST /api/table/leave    Leave table { address }
  POST /api/bet/place      Place bet { address, betType, amount }
  POST /api/shooter/roll   Roll dice { address }
  GET  /api/player/:addr/bets  Get player's bets

  Bet Types: pass_line, dont_pass, come, dont_come,
             place_4, place_5, place_6, place_8, place_9, place_10,
             ce_craps, ce_eleven

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  });
}
