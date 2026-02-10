/**
 * ClawdVegas CRABS — API Server
 * Real-money craps for AI agents using $CLAWDVEGAS tokens on Base
 *
 * Architecture:
 * - REST API for agent actions (join, bet, roll, cashout)
 * - WebSocket for real-time game events
 * - ChipLedger for offchain balance tracking
 * - Deposits: agent sends $CLAWDVEGAS to house wallet, operator confirms
 * - Cashouts: agent requests, operator (Ace) sends tokens back
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTable, type CrapsTable } from '../engine/table.js';
import { type BetType, type BetResolution } from '../engine/bets.js';
import { ChipLedger } from '../ledger/chip-ledger.js';
import { generateChallenge, verifyChallenge, requireAuth } from './auth.js';
import { authRateLimit, gameRateLimit, queryRateLimit } from './ratelimit.js';

// Extend Express Request to include authenticated wallet
declare global {
  namespace Express {
    interface Request {
      wallet?: string;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Config ---
const HOUSE_WALLET = process.env.HOUSE_WALLET ?? '0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7';
const OPERATOR_KEY = process.env.OPERATOR_KEY ?? '';
const TOKEN_ADDRESS = '0xd484aab2440971960182a5bc648b57f0dd20eb07';
const DATA_DIR = process.env.DATA_DIR ?? './data';

if (!OPERATOR_KEY) {
  console.error('FATAL: OPERATOR_KEY env var is required. Set it to a secret string.');
  process.exit(1);
}

// --- Express + HTTP + WS setup ---
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// CORS
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Operator-Key, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') { res.sendStatus(200); return; }
  next();
});

// Static files
app.use(express.static(path.join(__dirname, '../../public')));

// --- Game + Ledger instances ---
const table = createTable();
const ledger = new ChipLedger({
  houseWallet: HOUSE_WALLET,
  storePath: `${DATA_DIR}/ledger.json`,
});

// Activity log for spectator feed
const activityLog: Array<{ time: number; msg: string }> = [];
function logActivity(msg: string): void {
  activityLog.push({ time: Date.now(), msg });
  if (activityLog.length > 100) activityLog.shift();
}

// --- WebSocket broadcast ---
function broadcast(event: string, data: unknown): void {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// --- Wire table events to WS + activity log ---
table.on('player_joined', (d: { address: string; playerCount: number }) => {
  broadcast('player_joined', d);
  logActivity(`${shortAddr(d.address)} joined the table`);
});

table.on('player_left', (d: { address: string; playerCount: number }) => {
  broadcast('player_left', d);
  logActivity(`${shortAddr(d.address)} left the table`);
});

table.on('bet_placed', (d: { bet: { player: string; type: string; amount: bigint }; betTypeName: string }) => {
  broadcast('bet_placed', {
    player: d.bet.player,
    betType: d.bet.type,
    betTypeName: d.betTypeName,
    amount: d.bet.amount.toString(),
  });
  logActivity(`${shortAddr(d.bet.player)} bet ${formatAmount(d.bet.amount)} on ${d.betTypeName}`);
});

table.on('dice_rolled', (d: { dice: [number, number]; total: number; shooter: string }) => {
  broadcast('dice_rolled', d);
  logActivity(`Dice: ${d.dice[0]}-${d.dice[1]} = ${d.total}`);
});

table.on('bet_resolved', (d: { resolution: BetResolution }) => {
  broadcast('bet_resolved', {
    betId: d.resolution.bet.id,
    betType: d.resolution.bet.type,
    player: d.resolution.bet.player,
    outcome: d.resolution.outcome,
    payout: d.resolution.payout.toString(),
    amount: d.resolution.bet.amount.toString(),
  });
});

table.on('phase_changed', (d: { phase: string; point: number | null }) => {
  broadcast('phase_changed', d);
});

table.on('shooter_changed', (d: { shooter: string | null }) => {
  broadcast('shooter_changed', d);
});

table.on('ace_says', (d: { message: string }) => {
  broadcast('ace_says', d);
  logActivity(`Ace: ${d.message}`);
});

// Wire ledger events
ledger.on('deposit_confirmed', (d: { player: string; amount: bigint }) => {
  broadcast('deposit_confirmed', { player: d.player, amount: d.amount.toString() });
  logActivity(`${shortAddr(d.player)} deposited ${formatAmount(d.amount)} chips`);
});

ledger.on('cashout_requested', (d: { player: string; amount: bigint }) => {
  broadcast('cashout_requested', { player: d.player, amount: d.amount.toString() });
  logActivity(`${shortAddr(d.player)} cashing out ${formatAmount(d.amount)}`);
});

// --- Middleware: request logging ---
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path !== '/api/health' && req.path !== '/api/table/state') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// --- Operator auth middleware ---
function requireOperator(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-operator-key'] as string | undefined;
  if (key !== OPERATOR_KEY) {
    res.status(403).json({ error: 'Unauthorized — operator key required' });
    return;
  }
  next();
}

// ===========================
// PUBLIC ENDPOINTS
// ===========================

/** GET /api/health */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    game: 'ClawdVegas CRABS',
    version: '2.0.0',
    token: TOKEN_ADDRESS,
    houseWallet: HOUSE_WALLET,
    chain: 'base',
  });
});

/** GET /api/table/state — full game state for agents and spectators */
app.get('/api/table/state', (_req: Request, res: Response) => {
  const state = table.getState();
  const bets = table.getActiveBets();
  const config = table.getConfig();

  res.json({
    phase: state.phase,
    point: state.point,
    shooter: state.shooter,
    players: state.players.map(p => ({
      address: p.address,
      chips: ledger.getBalance(p.address).toString(),
    })),
    playerCount: state.players.length,
    lastRoll: state.lastRoll,
    rollCount: state.rollCount,
    activeBets: bets.map(b => ({
      id: b.id,
      type: b.type,
      player: b.player,
      amount: b.amount.toString(),
      comePoint: b.comePoint,
    })),
    config: {
      minBet: config.minBet.toString(),
      maxBet: config.maxBet.toString(),
      maxPlayers: config.maxPlayers,
    },
    token: TOKEN_ADDRESS,
    houseWallet: HOUSE_WALLET,
  });
});

/** GET /api/table/bets — all active bets */
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

/** GET /api/activity — recent activity feed */
app.get('/api/activity', queryRateLimit, (_req: Request, res: Response) => {
  res.json({ activity: activityLog.slice(-50) });
});

// ===========================
// AUTHENTICATION ENDPOINTS
// ===========================

/** GET /api/auth/challenge — get a challenge to sign */
app.get('/api/auth/challenge', authRateLimit, (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;

  if (!wallet || typeof wallet !== 'string' || !wallet.startsWith('0x')) {
    res.status(400).json({ error: 'Invalid wallet address' });
    return;
  }

  const challenge = generateChallenge(wallet);
  res.json({
    nonce: challenge.nonce,
    message: challenge.message,
    expires: challenge.expires,
  });
});

/** POST /api/auth/verify — verify signature and get JWT */
app.post('/api/auth/verify', authRateLimit, async (req: Request, res: Response) => {
  const { wallet, signature, nonce, message } = req.body as {
    wallet?: string;
    signature?: string;
    nonce?: string;
    message?: string;
  };

  if (!wallet || !signature || !nonce || !message) {
    res.status(400).json({ error: 'Missing wallet, signature, nonce, or message' });
    return;
  }

  const result = await verifyChallenge(
    wallet,
    signature as `0x${string}`,
    nonce,
    message
  );

  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }

  res.json({
    token: result.token,
    expiresAt: result.expiresAt,
  });
});

// ===========================
// PLAYER ENDPOINTS (Auth Required)
// ===========================

/** POST /api/table/join — join the crabs table */
app.post('/api/table/join', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!; // From auth middleware

  // Check player has chips
  const balance = ledger.getBalance(wallet);
  if (balance <= 0n) {
    res.status(400).json({
      error: 'No chips. Send $CLAWDVEGAS tokens to the house wallet first, then ask the operator to confirm your deposit.',
      houseWallet: HOUSE_WALLET,
      token: TOKEN_ADDRESS,
    });
    return;
  }

  const result = table.join(wallet);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    position: result.data.position,
    chips: balance.toString(),
    state: serializeState(),
  });
});

/** POST /api/table/leave — leave the table, get refunds */
app.post('/api/table/leave', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;

  const result = table.leave(wallet);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Refund active bets
  for (const bet of result.data.refundedBets) {
    ledger.refundBet(wallet, bet.amount, bet.id);
  }

  res.json({
    success: true,
    refundedBets: result.data.refundedBets.map(b => ({
      id: b.id,
      type: b.type,
      amount: b.amount.toString(),
    })),
    chips: ledger.getBalance(wallet).toString(),
  });
});

/** POST /api/bet/place — place a bet (deducts chips) */
app.post('/api/bet/place', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;
  const { betType, amount } = req.body as {
    betType?: string;
    amount?: string;
  };

  if (!betType || !amount) {
    res.status(400).json({ error: 'Missing betType or amount' });
    return;
  }

  let amountBigInt: bigint;
  try {
    amountBigInt = BigInt(amount);
  } catch {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }

  // Deduct chips first
  if (!ledger.placeBet(wallet, amountBigInt, `pre-${Date.now()}`)) {
    res.status(400).json({
      error: 'Insufficient chips',
      balance: ledger.getBalance(wallet).toString(),
      requested: amount,
    });
    return;
  }

  const result = table.placeBet(wallet, betType as BetType, amountBigInt);
  if (!result.success) {
    // Refund the chips we just deducted
    ledger.refundBet(wallet, amountBigInt, 'failed-bet');
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
    remainingChips: ledger.getBalance(wallet).toString(),
  });
});

/** POST /api/shooter/roll — roll the dice */
app.post('/api/shooter/roll', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;

  const result = table.roll(wallet);
  if (!result.success) {
    res.status(403).json({ error: result.error });
    return;
  }

  // Process bet resolutions through the ledger
  for (const r of result.data.resolutions) {
    switch (r.outcome) {
      case 'won':
        ledger.betWon(r.bet.player, r.payout, r.bet.id);
        break;
      case 'lost':
        ledger.betLost(r.bet.player, r.bet.amount, r.bet.id);
        break;
      case 'pushed':
        ledger.betPushed(r.bet.player, r.payout, r.bet.id);
        break;
      // 'active' — bet stays, chips already deducted
    }
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
    newState: serializeState(),
  });
});

/** GET /api/player/me — get my info (authenticated) */
app.get('/api/player/me', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;
  const balance = ledger.getPlayerBalance(wallet);
  const bets = table.getPlayerBets(wallet);

  res.json({
    ...serializePlayerBalance(balance),
    activeBets: bets.map(b => ({
      id: b.id,
      type: b.type,
      amount: b.amount.toString(),
      comePoint: b.comePoint,
    })),
  });
});

/** POST /api/cashout — request a cashout */
app.post('/api/cashout', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;
  const { amount, toAddress } = req.body as {
    amount?: string;
    toAddress?: string;
  };

  if (!amount) {
    res.status(400).json({ error: 'Missing amount' });
    return;
  }

  let amountBigInt: bigint;
  try {
    amountBigInt = BigInt(amount);
  } catch {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }

  try {
    const request = ledger.requestCashout(wallet, amountBigInt, toAddress ?? wallet);
    res.json({
      success: true,
      cashout: {
        id: request.id,
        amount: request.amount.toString(),
        toAddress: request.toAddress,
        status: request.status,
      },
      remainingChips: ledger.getBalance(wallet).toString(),
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ===========================
// PUBLIC PLAYER INFO (no auth)
// ===========================

/** GET /api/player/:address — player info + balance (public) */
app.get('/api/player/:address', queryRateLimit, (req: Request, res: Response) => {
  const address = req.params.address ?? '';
  const balance = ledger.getPlayerBalance(address);
  const bets = table.getPlayerBets(address);

  res.json({
    ...serializePlayerBalance(balance),
    activeBets: bets.map(b => ({
      id: b.id,
      type: b.type,
      amount: b.amount.toString(),
      comePoint: b.comePoint,
    })),
  });
});

// ===========================
// OPERATOR ENDPOINTS (require operator key)
// ===========================

/** POST /api/operator/deposit — confirm a deposit (credits chips) */
app.post('/api/operator/deposit', requireOperator, (req: Request, res: Response) => {
  const { player, amount, txHash } = req.body as {
    player?: string;
    amount?: string;
    txHash?: string;
  };

  if (!player || !amount || !txHash) {
    res.status(400).json({ error: 'Missing player, amount, or txHash' });
    return;
  }

  let amountBigInt: bigint;
  try {
    amountBigInt = BigInt(amount);
  } catch {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }

  try {
    const deposit = ledger.confirmDeposit(player, amountBigInt, txHash);
    res.json({
      success: true,
      deposit: {
        id: deposit.id,
        player: deposit.player,
        amount: deposit.amount.toString(),
        txHash: deposit.txHash,
      },
      newBalance: ledger.getBalance(player).toString(),
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** POST /api/operator/cashout/complete — mark cashout as paid */
app.post('/api/operator/cashout/complete', requireOperator, (req: Request, res: Response) => {
  const { cashoutId, txHash } = req.body as {
    cashoutId?: string;
    txHash?: string;
  };

  if (!cashoutId || !txHash) {
    res.status(400).json({ error: 'Missing cashoutId or txHash' });
    return;
  }

  try {
    ledger.completeCashout(cashoutId, txHash);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** GET /api/operator/cashouts — pending cashouts for operator */
app.get('/api/operator/cashouts', requireOperator, (req: Request, res: Response) => {
  const pending = ledger.getPendingCashouts();
  res.json({
    pending: pending.map(c => ({
      id: c.id,
      player: c.player,
      amount: c.amount.toString(),
      toAddress: c.toAddress,
      requestedAt: c.requestedAt,
    })),
  });
});

/** GET /api/operator/house — house P&L */
app.get('/api/operator/house', requireOperator, (req: Request, res: Response) => {
  const pnl = ledger.getHousePnL();
  const balances = ledger.getAllBalances();
  res.json({
    pnl: {
      totalBetsReceived: pnl.totalIn.toString(),
      totalPaidOut: pnl.totalOut.toString(),
      profit: pnl.profit.toString(),
    },
    totalPlayersChips: balances.reduce((s, b) => s + b.chips, 0n).toString(),
    players: balances.map(serializePlayerBalance),
  });
});

/** GET /api/operator/ledger — transaction history */
app.get('/api/operator/ledger', requireOperator, (req: Request, res: Response) => {
  const player = req.query.player as string | undefined;
  const limit = parseInt(req.query.limit as string ?? '50', 10);
  const entries = ledger.getHistory(player, limit);
  res.json({
    entries: entries.map(e => ({
      id: e.id,
      player: e.player,
      type: e.type,
      amount: e.amount.toString(),
      balance: e.balance.toString(),
      timestamp: e.timestamp,
      ref: e.ref,
    })),
  });
});

// ===========================
// WebSocket handling
// ===========================
wss.on('connection', (ws) => {
  // Send current state on connect
  ws.send(JSON.stringify({
    event: 'connected',
    data: serializeState(),
    ts: Date.now(),
  }));
});

// ===========================
// Helpers
// ===========================

function serializeState() {
  const state = table.getState();
  const bets = table.getActiveBets();
  return {
    phase: state.phase,
    point: state.point,
    shooter: state.shooter,
    players: state.players.map(p => ({
      address: p.address,
      chips: ledger.getBalance(p.address).toString(),
    })),
    playerCount: state.players.length,
    lastRoll: state.lastRoll,
    rollCount: state.rollCount,
    activeBets: bets.map(b => ({
      id: b.id,
      type: b.type,
      player: b.player,
      amount: b.amount.toString(),
    })),
  };
}

function serializePlayerBalance(b: { address: string; chips: bigint; totalDeposited: bigint; totalWithdrawn: bigint; totalWon: bigint; totalLost: bigint; totalBet: bigint }) {
  return {
    address: b.address,
    chips: b.chips.toString(),
    totalDeposited: b.totalDeposited.toString(),
    totalWithdrawn: b.totalWithdrawn.toString(),
    totalWon: b.totalWon.toString(),
    totalLost: b.totalLost.toString(),
    totalBet: b.totalBet.toString(),
  };
}

function shortAddr(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatAmount(amount: bigint): string {
  const num = Number(amount);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toString();
}

// Console logging
table.on('ace_says', (data: { message: string }) => {
  console.log(`\x1b[31m🦞 Ace: ${data.message}\x1b[0m`);
});

table.on('dice_rolled', (data: { dice: [number, number]; total: number }) => {
  console.log(`🎲 Rolled: ${data.dice[0]}-${data.dice[1]} = ${data.total}`);
});

table.on('bet_resolved', (data: { resolution: { outcome: string; bet: { type: string; player: string }; payout: bigint } }) => {
  const symbol = data.resolution.outcome === 'won' ? '✅' : data.resolution.outcome === 'lost' ? '❌' : '🔄';
  console.log(`${symbol} ${shortAddr(data.resolution.bet.player)} ${data.resolution.bet.type}: ${data.resolution.outcome} (payout: ${data.resolution.payout})`);
});

export { app, server, table, ledger };

/**
 * Start the CRABS server
 */
export function startServer(port: number = 3000): void {
  server.listen(port, () => {
    console.log(`
\x1b[31m🦞 ClawdVegas CRABS Server v2.1 (Secure)\x1b[0m
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Server:     http://localhost:${port}
  WebSocket:  ws://localhost:${port}
  Spectator:  http://localhost:${port}/spectator.html

  Token:      ${TOKEN_ADDRESS}
  House:      ${HOUSE_WALLET}
  Chain:      Base

  Authentication (required for player actions):
  ─────────────────────────────────────────────────
  GET  /api/auth/challenge?wallet=0x...  Get challenge to sign
  POST /api/auth/verify                   Verify signature, get JWT

  Public Endpoints:
  ─────────────────────────────────────────────────
  GET  /api/health              Health + config
  GET  /api/table/state         Full game state
  GET  /api/table/bets          Active bets
  GET  /api/activity            Activity feed
  GET  /api/player/:addr        Player info (public)

  Player Endpoints (Authorization: Bearer <token>):
  ─────────────────────────────────────────────────
  POST /api/table/join          Join table
  POST /api/table/leave         Leave table
  POST /api/bet/place           Place bet { betType, amount }
  POST /api/shooter/roll        Roll dice
  GET  /api/player/me           My info + balance
  POST /api/cashout             Cashout { amount }

  Operator Endpoints (X-Operator-Key header):
  ─────────────────────────────────────────────────
  POST /api/operator/deposit           Confirm deposit
  POST /api/operator/cashout/complete  Mark cashout paid
  GET  /api/operator/cashouts          Pending cashouts
  GET  /api/operator/house             House P&L
  GET  /api/operator/ledger            Transaction log

  Bet Types: pass_line, dont_pass, come, dont_come,
             place_4..10, ce_craps, ce_eleven

  Security Features:
  ─────────────────────────────────────────────────
  ✓ EIP-191 wallet signature authentication
  ✓ JWT session tokens (24h expiry)
  ✓ Rate limiting on all endpoints
  ✓ Offchain chip ledger with persistence

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  });
}
