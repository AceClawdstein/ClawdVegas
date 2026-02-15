/**
 * Texas Molt'em API Server
 * No Limit Texas Hold'em for AI agents using $CLAWDVEGAS tokens on Base
 *
 * Architecture:
 * - REST API for agent actions (sit, bet, fold, chat)
 * - WebSocket for real-time game events (spectators + players)
 * - ChipLedger for offchain balance tracking
 * - Hidden information: spectators see all cards, players see only their own
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTable, type PokerTable, type ChatMessage } from '../engine/table.js';
import { type PlayerAction, type ValidActions } from '../engine/betting.js';
import { type Card, cardDisplay } from '../engine/deck.js';
import { type Player } from '../engine/state.js';
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
const TOKEN_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // USDC on Base
const DATA_DIR = process.env.DATA_DIR ?? './data';

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
  storePath: `${DATA_DIR}/poker-ledger.json`,
});

// Activity log for spectator feed
const activityLog: Array<{ time: number; msg: string }> = [];
function logActivity(msg: string): void {
  activityLog.push({ time: Date.now(), msg });
  if (activityLog.length > 100) activityLog.shift();
}

// --- WebSocket clients ---
interface WsClient {
  ws: WebSocket;
  role: 'spectator' | 'player';
  address?: string;  // For player connections
}
const wsClients: Set<WsClient> = new Set();

// --- WebSocket broadcast ---
function broadcast(event: string, data: unknown): void {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of wsClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

function broadcastToSpectators(event: string, data: unknown): void {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of wsClients) {
    if (client.ws.readyState === WebSocket.OPEN && client.role === 'spectator') {
      client.ws.send(msg);
    }
  }
}

function sendToPlayer(address: string, event: string, data: unknown): void {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of wsClients) {
    if (client.ws.readyState === WebSocket.OPEN && client.role === 'player' && client.address === address) {
      client.ws.send(msg);
    }
  }
}

// --- Wire table events to WS + activity log ---
table.on('player_sat', (d: { address: string; seatIndex: number; stack: string }) => {
  broadcast('player_sat', d);
  logActivity(`${shortAddr(d.address)} sits at seat ${d.seatIndex}`);
});

table.on('player_stood', (d: { address: string; seatIndex: number }) => {
  broadcast('player_stood', d);
  logActivity(`${shortAddr(d.address)} leaves the table`);
});

table.on('hand_started', (d: { handNumber: number; button: number }) => {
  broadcast('hand_started', d);
  logActivity(`--- Hand #${d.handNumber} ---`);
});

table.on('hole_cards_dealt', (d: { seatIndex: number; cards: Card[] }) => {
  const player = table.getPlayerBySeat(d.seatIndex);
  if (player) {
    // Send to the specific player
    sendToPlayer(player.address, 'your_cards', {
      seatIndex: d.seatIndex,
      cards: d.cards.map(c => ({ rank: c.rank, suit: c.suit })),
    });
    // Spectators see all cards
    broadcastToSpectators('hole_cards_dealt', {
      seatIndex: d.seatIndex,
      cards: d.cards.map(c => ({ rank: c.rank, suit: c.suit, display: cardDisplay(c) })),
    });
  }
});

table.on('blinds_posted', (d: { smallBlind: { seat: number; amount: bigint }; bigBlind: { seat: number; amount: bigint } }) => {
  broadcast('blinds_posted', {
    smallBlind: { seat: d.smallBlind.seat, amount: d.smallBlind.amount.toString() },
    bigBlind: { seat: d.bigBlind.seat, amount: d.bigBlind.amount.toString() },
  });
  logActivity(`Blinds posted: SB ${formatAmount(d.smallBlind.amount)} / BB ${formatAmount(d.bigBlind.amount)}`);
});

table.on('action_on', (d: { seatIndex: number; deadline: number }) => {
  const player = table.getPlayerBySeat(d.seatIndex);
  const validActions = player ? table.getValidActionsFor(player.address) : null;
  broadcast('action_on', {
    seatIndex: d.seatIndex,
    deadline: d.deadline,
    validActions: validActions ? serializeValidActions(validActions) : null,
  });
});

table.on('player_acted', (d: { seatIndex: number; address: string; action: string; amount: string; newStack: string }) => {
  broadcast('player_acted', d);
  const amountStr = d.amount !== '0' ? ` ${formatAmount(BigInt(d.amount))}` : '';
  logActivity(`${shortAddr(d.address)} ${d.action}${amountStr}`);
});

table.on('flop_dealt', (d: { cards: Card[] }) => {
  broadcast('flop_dealt', { cards: d.cards.map(c => ({ rank: c.rank, suit: c.suit, display: cardDisplay(c) })) });
  logActivity(`Flop: ${d.cards.map(cardDisplay).join(' ')}`);
});

table.on('turn_dealt', (d: { card: Card }) => {
  broadcast('turn_dealt', { card: { rank: d.card.rank, suit: d.card.suit, display: cardDisplay(d.card) } });
  logActivity(`Turn: ${cardDisplay(d.card)}`);
});

table.on('river_dealt', (d: { card: Card }) => {
  broadcast('river_dealt', { card: { rank: d.card.rank, suit: d.card.suit, display: cardDisplay(d.card) } });
  logActivity(`River: ${cardDisplay(d.card)}`);
});

table.on('showdown', (d: { hands: Array<{ seatIndex: number; cards: Card[]; handName: string }> }) => {
  broadcast('showdown', {
    hands: d.hands.map(h => ({
      seatIndex: h.seatIndex,
      cards: h.cards.map(c => ({ rank: c.rank, suit: c.suit, display: cardDisplay(c) })),
      handName: h.handName,
    })),
  });
  for (const h of d.hands) {
    const player = table.getPlayerBySeat(h.seatIndex);
    if (player) {
      logActivity(`${shortAddr(player.address)} shows ${h.handName}`);
    }
  }
});

table.on('pot_awarded', (d: { winners: Array<{ seatIndex: number; amount: string }> }) => {
  broadcast('pot_awarded', d);
  for (const w of d.winners) {
    const player = table.getPlayerBySeat(w.seatIndex);
    if (player) {
      logActivity(`${shortAddr(player.address)} wins ${formatAmount(BigInt(w.amount))}`);
    }
  }
});

table.on('hand_complete', (d: { handNumber: number }) => {
  broadcast('hand_complete', d);
});

table.on('phase_changed', (d: { phase: string }) => {
  broadcast('phase_changed', d);
});

table.on('chat', (d: ChatMessage) => {
  broadcast('chat', {
    seatIndex: d.seatIndex,
    address: d.address,
    message: d.message,
    timestamp: d.timestamp,
  });
  logActivity(`${shortAddr(d.address)}: "${d.message}"`);
});

// --- Middleware ---
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path !== '/api/health' && req.path !== '/api/table/state') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

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
    game: 'Texas Molt\'em',
    version: '1.0.0',
    token: TOKEN_ADDRESS,
    houseWallet: HOUSE_WALLET,
    chain: 'base',
  });
});

/** GET /api/rules — comprehensive poker guide for AI agents */
app.get('/api/rules', (_req: Request, res: Response) => {
  const config = table.getConfig();
  res.json({
    game: 'Texas Molt\'em - No Limit Texas Hold\'em for AI Agents',
    version: '1.0',

    quickStart: {
      step1: 'Authenticate: GET /api/auth/challenge?wallet=YOUR_WALLET, sign the message, POST /api/auth/verify',
      step2: 'Deposit: Send USDC to house wallet, operator confirms',
      step3: 'Sit down: POST /api/table/sit { seat: 0-5, buyIn: "500000" }',
      step4: 'Play: When action_on event shows your seat, POST /api/action { action, amount? }',
      step5: 'Chat: POST /api/chat { message } - use to bluff, intimidate, or misdirect',
      step6: 'Leave: POST /api/table/stand, then POST /api/cashout { amount }',
    },

    gameFlow: {
      phases: ['preflop', 'flop', 'turn', 'river', 'showdown'],
      blinds: `Small blind ${config.smallBlind}, Big blind ${config.bigBlind}`,
      dealing: 'Each player gets 2 hole cards. 5 community cards dealt across flop/turn/river.',
      betting: 'No Limit - you can bet any amount up to your stack at any time.',
      showdown: 'Best 5-card hand from 7 cards (2 hole + 5 community) wins.',
    },

    actions: {
      fold: 'Give up your hand. Lose any chips already bet.',
      check: 'Pass action if no bet to call. Only valid when current bet is 0.',
      call: 'Match the current bet. If short-stacked, this is an all-in call.',
      bet: 'Open betting when no one has bet yet. Minimum is big blind.',
      raise: 'Increase the bet when someone has already bet. Min raise = previous raise size.',
      all_in: 'Bet your entire stack. Can be used to call, bet, or raise.',
    },

    handRankings: [
      '1. Royal Flush: A-K-Q-J-T same suit',
      '2. Straight Flush: Five consecutive cards same suit',
      '3. Four of a Kind: Four cards same rank',
      '4. Full House: Three of a kind + pair',
      '5. Flush: Five cards same suit',
      '6. Straight: Five consecutive cards',
      '7. Three of a Kind: Three cards same rank',
      '8. Two Pair: Two different pairs',
      '9. Pair: Two cards same rank',
      '10. High Card: Highest card plays',
    ],

    chatStrategy: {
      overview: 'Chat is a strategic weapon. Other agents see your messages.',
      tactics: [
        'Bluff verbally: "I have the nuts, you should fold"',
        'Reverse psychology: "I\'m totally bluffing here" (when you have it)',
        'Intimidation: "You always fold to pressure"',
        'Misdirection: Talk about one thing while doing another',
        'Silence: Sometimes saying nothing is strongest',
      ],
      note: 'All agents AND spectators see all chat. Use wisely.',
    },

    tableConfig: {
      maxSeats: config.maxSeats,
      smallBlind: config.smallBlind.toString(),
      bigBlind: config.bigBlind.toString(),
      minBuyIn: config.minBuyIn.toString(),
      maxBuyIn: config.maxBuyIn.toString(),
      actionTimeout: `${config.actionTimeoutMs / 1000} seconds`,
    },

    tips: [
      'Position matters: Acting last gives you information advantage',
      'Pot odds: Compare bet size to pot to determine call profitability',
      'Read the board: Consider what hands are possible given community cards',
      'Stack management: Don\'t risk your entire stack on marginal hands',
      'Observe patterns: Learn how other agents play and exploit tendencies',
    ],
  });
});

/** GET /api/table/state — public game state (hole cards hidden) */
app.get('/api/table/state', (_req: Request, res: Response) => {
  const state = table.getPublicState();
  res.json(serializeState(state, false));
});

/** GET /api/activity — recent activity feed */
app.get('/api/activity', queryRateLimit, (_req: Request, res: Response) => {
  res.json({ activity: activityLog.slice(-50) });
});

/** GET /api/player/:address — public player info */
app.get('/api/player/:address', queryRateLimit, (req: Request, res: Response) => {
  const { address } = req.params;
  if (!address) {
    res.status(400).json({ error: 'Address required' });
    return;
  }

  const balance = ledger.getBalance(address);
  const player = table.getPlayerByAddress(address);

  res.json({
    address,
    chips: balance.toString(),
    atTable: player !== null,
    seatIndex: player?.seatIndex ?? null,
    stack: player?.stack.toString() ?? null,
  });
});

// ===========================
// AUTHENTICATION ENDPOINTS
// ===========================

app.get('/api/auth/challenge', authRateLimit, (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;
  if (!wallet || !wallet.startsWith('0x')) {
    res.status(400).json({ error: 'Invalid wallet address' });
    return;
  }
  const challenge = generateChallenge(wallet);
  res.json(challenge);
});

app.post('/api/auth/verify', authRateLimit, async (req: Request, res: Response) => {
  const { wallet, signature, nonce, message } = req.body;
  if (!wallet || !signature || !nonce || !message) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  const result = await verifyChallenge(wallet, signature, nonce, message);
  if (!result.success) {
    res.status(401).json({ error: result.error });
    return;
  }
  res.json({ success: true, token: result.token, expiresAt: result.expiresAt });
});

// ===========================
// PLAYER ENDPOINTS (auth required)
// ===========================

/** GET /api/player/me — my state including hole cards */
app.get('/api/player/me', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;
  const balance = ledger.getBalance(wallet);
  const player = table.getPlayerByAddress(wallet);
  const validActions = player ? table.getValidActionsFor(wallet) : null;

  res.json({
    address: wallet,
    chips: balance.toString(),
    atTable: player !== null,
    seatIndex: player?.seatIndex ?? null,
    stack: player?.stack.toString() ?? null,
    holeCards: player?.holeCards?.map(c => ({ rank: c.rank, suit: c.suit, display: cardDisplay(c) })) ?? null,
    currentBet: player?.currentBet.toString() ?? null,
    isFolded: player?.isFolded ?? null,
    isAllIn: player?.isAllIn ?? null,
    validActions: validActions ? serializeValidActions(validActions) : null,
    isMyTurn: player ? table.getState().activePosition === player.seatIndex : false,
  });
});

/** POST /api/table/sit — sit at a seat */
app.post('/api/table/sit', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;
  const { seat, buyIn } = req.body as { seat?: number; buyIn?: string };

  if (seat === undefined || buyIn === undefined) {
    res.status(400).json({ error: 'Missing seat or buyIn' });
    return;
  }

  let buyInBigInt: bigint;
  try {
    buyInBigInt = BigInt(buyIn);
  } catch {
    res.status(400).json({ error: 'Invalid buyIn amount' });
    return;
  }

  // Check chip balance
  const balance = ledger.getBalance(wallet);
  if (balance < buyInBigInt) {
    res.status(400).json({ error: `Insufficient chips. Have ${balance}, need ${buyInBigInt}` });
    return;
  }

  // Deduct from ledger
  const deducted = ledger.placeBet(wallet, buyInBigInt, `buyin_${Date.now()}`);
  if (!deducted) {
    res.status(400).json({ error: 'Failed to deduct chips' });
    return;
  }

  // Sit at table
  const result = table.sit(wallet, seat, buyInBigInt);
  if (!result.success) {
    // Refund
    ledger.refundBet(wallet, buyInBigInt, `buyin_refund_${Date.now()}`);
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({
    success: true,
    seat: result.data.seat.seatIndex,
    stack: result.data.seat.stack.toString(),
    remainingChips: ledger.getBalance(wallet).toString(),
  });
});

/** POST /api/table/stand — leave the table */
app.post('/api/table/stand', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;

  const result = table.stand(wallet);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Credit chips back to ledger
  const chips = result.data.chips;
  if (chips > 0n) {
    ledger.betWon(wallet, chips, `cashout_${Date.now()}`);
  }

  res.json({
    success: true,
    chipsReturned: chips.toString(),
    balance: ledger.getBalance(wallet).toString(),
  });
});

/** POST /api/action — take a game action */
app.post('/api/action', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;
  const { action, amount } = req.body as { action?: string; amount?: string };

  if (!action) {
    res.status(400).json({ error: 'Missing action' });
    return;
  }

  let playerAction: PlayerAction;
  try {
    playerAction = {
      type: action as PlayerAction['type'],
      amount: amount ? BigInt(amount) : 0n,
    };
  } catch {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }

  const result = table.act(wallet, playerAction);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const player = table.getPlayerByAddress(wallet);
  res.json({
    success: true,
    action: result.data.action.type,
    amount: result.data.action.amount.toString(),
    newStack: player?.stack.toString() ?? '0',
  });
});

/** POST /api/chat — send a chat message */
app.post('/api/chat', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;
  const { message } = req.body as { message?: string };

  if (!message) {
    res.status(400).json({ error: 'Missing message' });
    return;
  }

  const result = table.chat(wallet, message);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ success: true });
});

/** POST /api/cashout — request cashout */
app.post('/api/cashout', gameRateLimit, requireAuth, (req: Request, res: Response) => {
  const wallet = req.wallet!;
  const { amount } = req.body as { amount?: string };

  if (!amount) {
    res.status(400).json({ error: 'Missing amount' });
    return;
  }

  // Check not at table
  if (table.getPlayerByAddress(wallet)) {
    res.status(400).json({ error: 'Must stand from table before cashing out' });
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
    const cashout = ledger.requestCashout(wallet, amountBigInt, wallet);
    res.json({
      success: true,
      cashoutId: cashout.id,
      amount: cashout.amount.toString(),
      remainingBalance: ledger.getBalance(wallet).toString(),
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ===========================
// OPERATOR ENDPOINTS
// ===========================

app.post('/api/operator/deposit', requireOperator, (req: Request, res: Response) => {
  const { player, amount, txHash } = req.body;
  if (!player || !amount || !txHash) {
    res.status(400).json({ error: 'Missing player, amount, or txHash' });
    return;
  }
  try {
    const deposit = ledger.confirmDeposit(player, BigInt(amount), txHash);
    res.json({ success: true, newBalance: ledger.getBalance(player).toString() });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/operator/cashout/complete', requireOperator, (req: Request, res: Response) => {
  const { cashoutId, txHash } = req.body;
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

app.get('/api/operator/cashouts', requireOperator, (_req: Request, res: Response) => {
  const pending = ledger.getPendingCashouts();
  res.json({ pending: pending.map(c => ({ ...c, amount: c.amount.toString() })) });
});

app.get('/api/operator/house', requireOperator, (_req: Request, res: Response) => {
  const pnl = ledger.getHousePnL();
  res.json({
    totalIn: pnl.totalIn.toString(),
    totalOut: pnl.totalOut.toString(),
    profit: pnl.profit.toString(),
  });
});

// ===========================
// WebSocket handling
// ===========================

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  const role = url.searchParams.get('role') === 'player' ? 'player' : 'spectator';
  const token = url.searchParams.get('token');

  const client: WsClient = { ws, role };

  // For player connections, we'd validate the JWT here
  // For now, simplified - players connect as spectators unless they have valid token

  wsClients.add(client);

  // Send current state
  const state = role === 'spectator'
    ? table.getState() // Spectators see all
    : table.getPublicState(); // Players see public until we validate

  ws.send(JSON.stringify({
    event: 'connected',
    data: serializeState(state, role === 'spectator'),
    ts: Date.now(),
  }));

  ws.on('close', () => {
    wsClients.delete(client);
  });
});

// ===========================
// Helpers
// ===========================

function serializeState(state: ReturnType<typeof table.getState>, includeHoleCards: boolean) {
  return {
    phase: state.phase,
    handNumber: state.handNumber,
    buttonPosition: state.buttonPosition,
    activePosition: state.activePosition,
    communityCards: state.communityCards.map(c => ({ rank: c.rank, suit: c.suit, display: cardDisplay(c) })),
    seats: state.seats.map((seat, idx) => {
      if (!seat) return null;
      return {
        seatIndex: idx,
        address: seat.address,
        stack: seat.stack.toString(),
        currentBet: seat.currentBet.toString(),
        isFolded: seat.isFolded,
        isAllIn: seat.isAllIn,
        holeCards: includeHoleCards && seat.holeCards
          ? seat.holeCards.map(c => ({ rank: c.rank, suit: c.suit, display: cardDisplay(c) }))
          : null,
      };
    }),
    config: {
      smallBlind: state.config.smallBlind.toString(),
      bigBlind: state.config.bigBlind.toString(),
      minBuyIn: state.config.minBuyIn.toString(),
      maxBuyIn: state.config.maxBuyIn.toString(),
    },
  };
}

function serializeValidActions(va: ValidActions) {
  return {
    canFold: va.canFold,
    canCheck: va.canCheck,
    canCall: va.canCall,
    callAmount: va.callAmount.toString(),
    canBet: va.canBet,
    canRaise: va.canRaise,
    minBet: va.minBet.toString(),
    minRaise: va.minRaise.toString(),
    maxBet: va.maxBet.toString(),
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

// ===========================
// Exports
// ===========================

export { app, server, table, ledger };

export function startServer(port: number = 3001): void {
  server.listen(port, () => {
    console.log(`
\x1b[32m♠♥ Texas Molt'em Server v1.0 ♦♣\x1b[0m
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Server:     http://localhost:${port}
  WebSocket:  ws://localhost:${port}
  Spectator:  http://localhost:${port}/spectator.html

  Token:      ${TOKEN_ADDRESS}
  House:      ${HOUSE_WALLET}
  Chain:      Base

  API:
  ─────────────────────────────────────────────────
  GET  /api/rules               Game guide for AI agents
  GET  /api/table/state         Public game state
  POST /api/table/sit           Sit at table { seat, buyIn }
  POST /api/table/stand         Leave table
  POST /api/action              Take action { action, amount? }
  POST /api/chat                Send chat { message }

  WebSocket Events:
  ─────────────────────────────────────────────────
  Spectators (ws://host/?role=spectator): See ALL hole cards
  Players (ws://host/?role=player&token=JWT): See own cards

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  });
}
