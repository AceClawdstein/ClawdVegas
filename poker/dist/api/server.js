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
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTable } from '../engine/table.js';
import { cardDisplay } from '../engine/deck.js';
import { ChipLedger } from '../ledger/chip-ledger.js';
import { generateChallenge, verifyChallenge, requireAuth } from './auth.js';
import { authRateLimit, gameRateLimit, queryRateLimit } from './ratelimit.js';
import { createLLMAgents } from '../agents/llm-agent.js';
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
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
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
const activityLog = [];
function logActivity(msg) {
    activityLog.push({ time: Date.now(), msg });
    if (activityLog.length > 100)
        activityLog.shift();
}
const wsClients = new Set();
// --- WebSocket broadcast ---
function broadcast(event, data) {
    const msg = JSON.stringify({ event, data, ts: Date.now() });
    for (const client of wsClients) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}
function broadcastToSpectators(event, data) {
    const msg = JSON.stringify({ event, data, ts: Date.now() });
    for (const client of wsClients) {
        if (client.ws.readyState === WebSocket.OPEN && client.role === 'spectator') {
            client.ws.send(msg);
        }
    }
}
function sendToPlayer(address, event, data) {
    const msg = JSON.stringify({ event, data, ts: Date.now() });
    for (const client of wsClients) {
        if (client.ws.readyState === WebSocket.OPEN && client.role === 'player' && client.address === address) {
            client.ws.send(msg);
        }
    }
}
// --- Wire table events to WS + activity log ---
table.on('player_sat', (d) => {
    broadcast('player_sat', d);
    logActivity(`${shortAddr(d.address)} sits at seat ${d.seatIndex}`);
});
table.on('player_stood', (d) => {
    broadcast('player_stood', d);
    logActivity(`${shortAddr(d.address)} leaves the table`);
});
table.on('hand_started', (d) => {
    broadcast('hand_started', d);
    logActivity(`--- Hand #${d.handNumber} ---`);
});
table.on('hole_cards_dealt', (d) => {
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
table.on('blinds_posted', (d) => {
    broadcast('blinds_posted', {
        smallBlind: { seat: d.smallBlind.seat, amount: d.smallBlind.amount.toString() },
        bigBlind: { seat: d.bigBlind.seat, amount: d.bigBlind.amount.toString() },
    });
    logActivity(`Blinds posted: SB ${formatAmount(d.smallBlind.amount)} / BB ${formatAmount(d.bigBlind.amount)}`);
});
table.on('action_on', (d) => {
    const player = table.getPlayerBySeat(d.seatIndex);
    const validActions = player ? table.getValidActionsFor(player.address) : null;
    broadcast('action_on', {
        seatIndex: d.seatIndex,
        deadline: d.deadline,
        validActions: validActions ? serializeValidActions(validActions) : null,
    });
});
table.on('player_acted', (d) => {
    broadcast('player_acted', d);
    const amountStr = d.amount !== '0' ? ` ${formatAmount(BigInt(d.amount))}` : '';
    logActivity(`${shortAddr(d.address)} ${d.action}${amountStr}`);
});
table.on('flop_dealt', (d) => {
    broadcast('flop_dealt', { cards: d.cards.map(c => ({ rank: c.rank, suit: c.suit, display: cardDisplay(c) })) });
    logActivity(`Flop: ${d.cards.map(cardDisplay).join(' ')}`);
});
table.on('turn_dealt', (d) => {
    broadcast('turn_dealt', { card: { rank: d.card.rank, suit: d.card.suit, display: cardDisplay(d.card) } });
    logActivity(`Turn: ${cardDisplay(d.card)}`);
});
table.on('river_dealt', (d) => {
    broadcast('river_dealt', { card: { rank: d.card.rank, suit: d.card.suit, display: cardDisplay(d.card) } });
    logActivity(`River: ${cardDisplay(d.card)}`);
});
table.on('showdown', (d) => {
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
table.on('pot_awarded', (d) => {
    broadcast('pot_awarded', d);
    for (const w of d.winners) {
        const player = table.getPlayerBySeat(w.seatIndex);
        if (player) {
            logActivity(`${shortAddr(player.address)} wins ${formatAmount(BigInt(w.amount))}`);
        }
    }
});
table.on('hand_complete', (d) => {
    broadcast('hand_complete', d);
});
table.on('phase_changed', (d) => {
    broadcast('phase_changed', d);
});
table.on('chat', (d) => {
    broadcast('chat', {
        seatIndex: d.seatIndex,
        address: d.address,
        message: d.message,
        timestamp: d.timestamp,
    });
    logActivity(`${shortAddr(d.address)}: "${d.message}"`);
});
// --- Middleware ---
app.use((req, _res, next) => {
    if (req.path !== '/api/health' && req.path !== '/api/table/state') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
});
function requireOperator(req, res, next) {
    const key = req.headers['x-operator-key'];
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
app.get('/api/health', (_req, res) => {
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
app.get('/api/rules', (_req, res) => {
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
app.get('/api/table/state', (_req, res) => {
    const state = table.getPublicState();
    res.json(serializeState(state, false));
});
/** GET /api/activity — recent activity feed */
app.get('/api/activity', queryRateLimit, (_req, res) => {
    res.json({ activity: activityLog.slice(-50) });
});
/** GET /api/player/:address — public player info */
app.get('/api/player/:address', queryRateLimit, (req, res) => {
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
app.get('/api/auth/challenge', authRateLimit, (req, res) => {
    const wallet = req.query.wallet;
    if (!wallet || !wallet.startsWith('0x')) {
        res.status(400).json({ error: 'Invalid wallet address' });
        return;
    }
    const challenge = generateChallenge(wallet);
    res.json(challenge);
});
app.post('/api/auth/verify', authRateLimit, async (req, res) => {
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
app.get('/api/player/me', gameRateLimit, requireAuth, (req, res) => {
    const wallet = req.wallet;
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
app.post('/api/table/sit', gameRateLimit, requireAuth, (req, res) => {
    const wallet = req.wallet;
    const { seat, buyIn } = req.body;
    if (seat === undefined || buyIn === undefined) {
        res.status(400).json({ error: 'Missing seat or buyIn' });
        return;
    }
    let buyInBigInt;
    try {
        buyInBigInt = BigInt(buyIn);
    }
    catch {
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
app.post('/api/table/stand', gameRateLimit, requireAuth, (req, res) => {
    const wallet = req.wallet;
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
app.post('/api/action', gameRateLimit, requireAuth, (req, res) => {
    const wallet = req.wallet;
    const { action, amount } = req.body;
    if (!action) {
        res.status(400).json({ error: 'Missing action' });
        return;
    }
    let playerAction;
    try {
        playerAction = {
            type: action,
            amount: amount ? BigInt(amount) : 0n,
        };
    }
    catch {
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
app.post('/api/chat', gameRateLimit, requireAuth, (req, res) => {
    const wallet = req.wallet;
    const { message } = req.body;
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
app.post('/api/cashout', gameRateLimit, requireAuth, (req, res) => {
    const wallet = req.wallet;
    const { amount } = req.body;
    if (!amount) {
        res.status(400).json({ error: 'Missing amount' });
        return;
    }
    // Check not at table
    if (table.getPlayerByAddress(wallet)) {
        res.status(400).json({ error: 'Must stand from table before cashing out' });
        return;
    }
    let amountBigInt;
    try {
        amountBigInt = BigInt(amount);
    }
    catch {
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
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// ===========================
// OPERATOR ENDPOINTS
// ===========================
app.post('/api/operator/deposit', requireOperator, (req, res) => {
    const { player, amount, txHash } = req.body;
    if (!player || !amount || !txHash) {
        res.status(400).json({ error: 'Missing player, amount, or txHash' });
        return;
    }
    try {
        const deposit = ledger.confirmDeposit(player, BigInt(amount), txHash);
        res.json({ success: true, newBalance: ledger.getBalance(player).toString() });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
app.post('/api/operator/cashout/complete', requireOperator, (req, res) => {
    const { cashoutId, txHash } = req.body;
    if (!cashoutId || !txHash) {
        res.status(400).json({ error: 'Missing cashoutId or txHash' });
        return;
    }
    try {
        ledger.completeCashout(cashoutId, txHash);
        res.json({ success: true });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
app.get('/api/operator/cashouts', requireOperator, (_req, res) => {
    const pending = ledger.getPendingCashouts();
    res.json({ pending: pending.map(c => ({ ...c, amount: c.amount.toString() })) });
});
app.get('/api/operator/house', requireOperator, (_req, res) => {
    const pnl = ledger.getHousePnL();
    res.json({
        totalIn: pnl.totalIn.toString(),
        totalOut: pnl.totalOut.toString(),
        profit: pnl.profit.toString(),
    });
});
const DEMO_AGENTS = [
    { name: 'AlphaBot', address: '0xDEMO000000000000000000000000000000000001', style: 'aggressive' },
    { name: 'BetaBot', address: '0xDEMO000000000000000000000000000000000002', style: 'tight' },
    { name: 'GammaBot', address: '0xDEMO000000000000000000000000000000000003', style: 'loose' },
    { name: 'DeltaBot', address: '0xDEMO000000000000000000000000000000000004', style: 'passive' },
    { name: 'EpsilonBot', address: '0xDEMO000000000000000000000000000000000005', style: 'aggressive' },
    { name: 'ZetaBot', address: '0xDEMO000000000000000000000000000000000006', style: 'tight' },
];
const DEMO_CHAT_LINES = {
    aggressive: [
        "I'm coming for your chips.",
        "You really want to call that?",
        "This is too easy.",
        "I smell fear.",
        "Big mistake.",
    ],
    tight: [
        "I only play premium hands.",
        "Patience is a virtue.",
        "I'll wait for my spot.",
        "Not this hand.",
        "Fold and live to fight another day.",
    ],
    loose: [
        "Let's gamble!",
        "I feel lucky today!",
        "Any two cards can win!",
        "YOLO!",
        "Fortune favors the bold!",
    ],
    passive: [
        "I'll just call here.",
        "Not sure about this...",
        "I guess I'll stay in.",
        "Let's see what happens.",
        "Hmm, okay.",
    ],
};
function makeAgentDecision(agent, validActions) {
    const rand = Math.random();
    if (agent.style === 'aggressive') {
        // Aggressive: bets and raises often
        if (validActions.canRaise && rand < 0.5) {
            const raise = validActions.minRaise + BigInt(Math.floor(Math.random() * Number(validActions.maxBet - validActions.minRaise)));
            return { action: 'raise', amount: raise.toString() };
        }
        if (validActions.canBet && rand < 0.6) {
            const bet = validActions.minBet + BigInt(Math.floor(Math.random() * Number(validActions.maxBet - validActions.minBet)));
            return { action: 'bet', amount: bet.toString() };
        }
        if (validActions.canCall)
            return { action: 'call' };
        if (validActions.canCheck)
            return { action: 'check' };
        return { action: 'fold' };
    }
    if (agent.style === 'tight') {
        // Tight: folds often, only plays strong
        if (rand < 0.4)
            return { action: 'fold' };
        if (validActions.canCheck)
            return { action: 'check' };
        if (validActions.canCall && rand < 0.3)
            return { action: 'call' };
        if (validActions.canRaise && rand < 0.1) {
            return { action: 'raise', amount: validActions.minRaise.toString() };
        }
        return { action: 'fold' };
    }
    if (agent.style === 'loose') {
        // Loose: calls and bets often
        if (validActions.canCall)
            return { action: 'call' };
        if (validActions.canBet && rand < 0.7) {
            return { action: 'bet', amount: validActions.minBet.toString() };
        }
        if (validActions.canCheck)
            return { action: 'check' };
        if (validActions.canRaise && rand < 0.3) {
            return { action: 'raise', amount: validActions.minRaise.toString() };
        }
        return { action: 'fold' };
    }
    // Passive: checks and calls, rarely bets
    if (validActions.canCheck)
        return { action: 'check' };
    if (validActions.canCall && rand < 0.6)
        return { action: 'call' };
    if (validActions.canBet && rand < 0.2) {
        return { action: 'bet', amount: validActions.minBet.toString() };
    }
    return { action: 'fold' };
}
async function runDemoHand(agents, log, actionDelayMs = 100) {
    // Wait for hand to actually start (table has 3-second delay before auto-starting)
    // We need to wait for an active phase: preflop, flop, turn, river, showdown
    const activePhasesSet = new Set(['preflop', 'flop', 'turn', 'river', 'showdown']);
    const maxWait = 50; // 5 seconds max
    let waitCount = 0;
    while (!activePhasesSet.has(table.getState().phase) && waitCount < maxWait) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
    }
    const currentPhase = table.getState().phase;
    if (!activePhasesSet.has(currentPhase)) {
        log.push(`Timeout waiting for hand to start (phase: ${currentPhase})`);
        return;
    }
    log.push(`Hand started - phase: ${currentPhase}`);
    // Play until hand is complete
    const maxActions = 100; // Prevent infinite loops
    let actionCount = 0;
    while (table.getState().phase !== 'waiting' && table.getState().phase !== 'complete' && actionCount < maxActions) {
        const state = table.getState();
        const activePos = state.activePosition;
        if (activePos === null) {
            // No active player, wait for next phase
            await new Promise(r => setTimeout(r, 200));
            continue;
        }
        const player = table.getPlayerBySeat(activePos);
        if (!player) {
            await new Promise(r => setTimeout(r, 200));
            continue;
        }
        const agent = agents.find(a => a.address === player.address);
        if (!agent) {
            await new Promise(r => setTimeout(r, 200));
            continue;
        }
        const validActions = table.getValidActionsFor(player.address);
        if (!validActions) {
            await new Promise(r => setTimeout(r, 200));
            continue;
        }
        // Maybe chat
        if (Math.random() < 0.2) {
            const lines = DEMO_CHAT_LINES[agent.style];
            const line = lines[Math.floor(Math.random() * lines.length)] ?? "...";
            table.chat(player.address, line);
            log.push(`${agent.name}: "${line}"`);
        }
        // Make decision
        const decision = makeAgentDecision(agent, validActions);
        const actionResult = table.act(player.address, {
            type: decision.action,
            amount: decision.amount ? BigInt(decision.amount) : 0n,
        });
        if (actionResult.success) {
            log.push(`${agent.name} ${decision.action}${decision.amount ? ' ' + decision.amount : ''}`);
        }
        else {
            log.push(`${agent.name} action failed: ${actionResult.error}`);
        }
        actionCount++;
        await new Promise(r => setTimeout(r, actionDelayMs));
    }
}
/**
 * POST /api/operator/demo - Run a demo poker game with AI agents
 *
 * Optional body:
 * - numAgents: number of agents to seat (2-6, default 4)
 * - hands: number of hands to play (1-10, default 3)
 * - buyIn: buy-in amount per agent (default 1000000)
 * - speed: 'fast' (100ms), 'normal' (800ms), 'slow' (1500ms) - default 'normal'
 */
app.post('/api/operator/demo', async (req, res) => {
    const { numAgents = 4, hands = 3, buyIn = '1000000', speed = 'normal' } = req.body;
    const agentCount = Math.max(2, Math.min(6, Number(numAgents)));
    const handCount = Math.max(1, Math.min(10, Number(hands)));
    const buyInAmount = BigInt(buyIn);
    // Action delay based on speed
    const speedDelays = {
        fast: 100,
        normal: 800,
        slow: 1500,
    };
    const actionDelayMs = speedDelays[speed] || 800;
    const selectedAgents = DEMO_AGENTS.slice(0, agentCount);
    const log = [];
    log.push(`Starting demo with ${agentCount} agents, ${handCount} hands`);
    // Wait for any active hand to complete before clearing table
    const activePhasesSet = new Set(['preflop', 'flop', 'turn', 'river', 'showdown']);
    let clearWait = 0;
    while (activePhasesSet.has(table.getState().phase) && clearWait < 100) {
        await new Promise(r => setTimeout(r, 100));
        clearWait++;
    }
    // Stand ALL existing players from ALL seats
    const state = table.getState();
    for (let i = 0; i < state.seats.length; i++) {
        const seat = state.seats[i];
        if (seat) {
            const standResult = table.stand(seat.address);
            if (standResult.success) {
                log.push(`Cleared seat ${i} (${shortAddr(seat.address)})`);
            }
        }
    }
    // Deposit chips for each agent
    for (const agent of selectedAgents) {
        ledger.confirmDeposit(agent.address, buyInAmount, `demo_${Date.now()}_${agent.name}`);
        log.push(`${agent.name} deposited ${buyInAmount}`);
    }
    // Seat agents
    for (let i = 0; i < selectedAgents.length; i++) {
        const agent = selectedAgents[i];
        const result = table.sit(agent.address, i, buyInAmount);
        if (result.success) {
            log.push(`${agent.name} sat at seat ${i}`);
        }
        else {
            log.push(`${agent.name} failed to sit: ${result.error}`);
        }
    }
    // Play hands
    for (let h = 0; h < handCount; h++) {
        log.push(`\n--- Starting Hand ${h + 1} ---`);
        // Check if we have enough players
        const seatedPlayers = table.getState().seats.filter(s => s !== null);
        if (seatedPlayers.length < 2) {
            log.push('Not enough players to continue');
            break;
        }
        // Run the hand
        await runDemoHand(selectedAgents, log, actionDelayMs);
        // Wait between hands
        await new Promise(r => setTimeout(r, 500));
    }
    // Get final state
    const finalState = table.getState();
    const results = selectedAgents.map(agent => {
        const player = table.getPlayerByAddress(agent.address);
        return {
            name: agent.name,
            address: agent.address,
            style: agent.style,
            stack: player?.stack.toString() ?? '0',
            atTable: player !== null,
        };
    });
    res.json({
        success: true,
        agentsPlayed: agentCount,
        handsPlayed: handCount,
        results,
        log,
        finalPhase: finalState.phase,
        handNumber: finalState.handNumber,
    });
});
// ===========================
// LLM-POWERED DEMO ENDPOINT
// ===========================
/**
 * POST /api/operator/demo-llm - Run a demo with LLM-powered agents
 *
 * These agents use Claude to make decisions based on:
 * - Their cards and hand strength
 * - Opponent actions and patterns
 * - Chat messages (bluff detection)
 * - Pot odds and position
 *
 * Optional body:
 * - numAgents: number of agents (2-6, default 4)
 * - hands: number of hands to play (1-5, default 2)
 * - buyIn: buy-in amount (default 1000000)
 */
app.post('/api/operator/demo-llm', async (req, res) => {
    const { numAgents = 4, hands = 2, buyIn = '1000000' } = req.body;
    const agentCount = Math.max(2, Math.min(6, Number(numAgents)));
    const handCount = Math.max(1, Math.min(5, Number(hands)));
    const buyInAmount = BigInt(buyIn);
    const actionDelayMs = 1500; // Slower for dramatic effect
    // Create LLM agents
    const llmAgents = createLLMAgents().slice(0, agentCount);
    const log = [];
    log.push(`Starting LLM demo with ${agentCount} AI agents, ${handCount} hands`);
    log.push(`Agents: ${llmAgents.map(a => `${a.name} (${a.personality})`).join(', ')}`);
    // Wait for any active hand to complete
    const activePhasesSet = new Set(['preflop', 'flop', 'turn', 'river', 'showdown']);
    let clearWait = 0;
    while (activePhasesSet.has(table.getState().phase) && clearWait < 100) {
        await new Promise(r => setTimeout(r, 100));
        clearWait++;
    }
    // Clear existing players
    const currentState = table.getState();
    for (let i = 0; i < currentState.seats.length; i++) {
        const seat = currentState.seats[i];
        if (seat) {
            table.stand(seat.address);
        }
    }
    // Deposit and seat agents
    for (let i = 0; i < llmAgents.length; i++) {
        const agent = llmAgents[i];
        ledger.confirmDeposit(agent.address, buyInAmount, `llm_demo_${Date.now()}_${agent.name}`);
        const result = table.sit(agent.address, i, buyInAmount);
        if (result.success) {
            log.push(`${agent.name} (${agent.personality}) sits at seat ${i}`);
        }
    }
    // Play hands
    for (let h = 0; h < handCount; h++) {
        log.push(`\n========== HAND ${h + 1} ==========`);
        // Reset agents for new hand
        for (const agent of llmAgents) {
            agent.newHand();
        }
        // Wait for hand to start
        let waitCount = 0;
        while (!activePhasesSet.has(table.getState().phase) && waitCount < 50) {
            await new Promise(r => setTimeout(r, 100));
            waitCount++;
        }
        if (!activePhasesSet.has(table.getState().phase)) {
            log.push('Timeout waiting for hand to start');
            continue;
        }
        // Play the hand
        const maxActions = 50;
        let actionCount = 0;
        while (table.getState().phase !== 'waiting' && table.getState().phase !== 'complete' && actionCount < maxActions) {
            const state = table.getState();
            const activePos = state.activePosition;
            if (activePos === null) {
                await new Promise(r => setTimeout(r, 200));
                continue;
            }
            const player = table.getPlayerBySeat(activePos);
            if (!player) {
                await new Promise(r => setTimeout(r, 200));
                continue;
            }
            const agent = llmAgents.find(a => a.address === player.address);
            if (!agent) {
                await new Promise(r => setTimeout(r, 200));
                continue;
            }
            const validActions = table.getValidActionsFor(player.address);
            if (!validActions) {
                await new Promise(r => setTimeout(r, 200));
                continue;
            }
            // Build opponent info
            const opponents = state.seats
                .filter((s) => s !== null && s.address !== player.address)
                .map(s => {
                const oppAgent = llmAgents.find(a => a.address === s.address);
                return {
                    name: oppAgent?.name || shortAddr(s.address),
                    stack: s.stack.toString(),
                    currentBet: s.currentBet.toString(),
                    isFolded: s.isFolded,
                    isAllIn: s.isAllIn,
                };
            });
            // Calculate position
            const numPlayers = state.seats.filter(s => s !== null).length;
            const relativePos = (activePos - state.buttonPosition + numPlayers) % numPlayers;
            let position = 'middle';
            if (relativePos <= 1)
                position = 'blinds';
            else if (relativePos <= numPlayers / 3)
                position = 'early';
            else if (relativePos >= numPlayers * 2 / 3)
                position = 'late';
            // Calculate pot
            let pot = 0n;
            for (const seat of state.seats) {
                if (seat)
                    pot += seat.currentBet;
            }
            // Get LLM decision
            log.push(`\n[${state.phase.toUpperCase()}] ${agent.name}'s turn...`);
            log.push(`Cards: ${player.holeCards?.map(cardDisplay).join(' ') || '??'} | Board: ${state.communityCards.map(cardDisplay).join(' ') || 'none'}`);
            let decision;
            try {
                decision = await agent.decide(player.holeCards || [], player.stack.toString(), player.currentBet.toString(), state.communityCards, pot.toString(), state.phase, opponents, validActions, activePos === state.buttonPosition, position);
            }
            catch (e) {
                log.push(`LLM error: ${e}. Defaulting to check/fold.`);
                decision = { action: validActions.canCheck ? 'check' : 'fold' };
            }
            if (decision.thinking) {
                log.push(`Thinking: ${decision.thinking}`);
            }
            // Execute action
            const actionResult = table.act(player.address, {
                type: decision.action,
                amount: decision.amount ? BigInt(decision.amount) : 0n,
            });
            if (actionResult.success) {
                const amountStr = decision.amount ? ` $${formatAmount(BigInt(decision.amount))}` : '';
                log.push(`>>> ${agent.name} ${decision.action.toUpperCase()}${amountStr}`);
                // Record action for all agents
                for (const a of llmAgents) {
                    a.recordAction(agent.name, decision.action, decision.amount, state.phase);
                }
            }
            else {
                log.push(`Action failed: ${actionResult.error}`);
            }
            // Send chat if any
            if (decision.chat) {
                table.chat(player.address, decision.chat);
                log.push(`${agent.name} says: "${decision.chat}"`);
                // Record chat for all agents
                for (const a of llmAgents) {
                    a.recordChat(agent.name, decision.chat);
                }
            }
            actionCount++;
            await new Promise(r => setTimeout(r, actionDelayMs));
        }
        // Wait between hands
        await new Promise(r => setTimeout(r, 2000));
    }
    // Get final results
    const finalState = table.getState();
    const results = llmAgents.map(agent => {
        const player = table.getPlayerByAddress(agent.address);
        return {
            name: agent.name,
            personality: agent.personality,
            address: agent.address,
            stack: player?.stack.toString() ?? '0',
            profit: player ? (player.stack - buyInAmount).toString() : (-buyInAmount).toString(),
        };
    });
    // Sort by profit
    results.sort((a, b) => Number(BigInt(b.profit) - BigInt(a.profit)));
    log.push(`\n========== FINAL STANDINGS ==========`);
    for (const r of results) {
        const profitNum = BigInt(r.profit);
        const profitStr = profitNum >= 0n ? `+$${formatAmount(profitNum)}` : `-$${formatAmount(-profitNum)}`;
        log.push(`${r.name} (${r.personality}): $${formatAmount(BigInt(r.stack))} (${profitStr})`);
    }
    res.json({
        success: true,
        agentsPlayed: agentCount,
        handsPlayed: handCount,
        results,
        log,
        finalPhase: finalState.phase,
        handNumber: finalState.handNumber,
    });
});
// ===========================
// WebSocket handling
// ===========================
wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const role = url.searchParams.get('role') === 'player' ? 'player' : 'spectator';
    const token = url.searchParams.get('token');
    const client = { ws, role };
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
function serializeState(state, includeHoleCards) {
    return {
        phase: state.phase,
        handNumber: state.handNumber,
        buttonPosition: state.buttonPosition,
        activePosition: state.activePosition,
        communityCards: state.communityCards.map(c => ({ rank: c.rank, suit: c.suit, display: cardDisplay(c) })),
        seats: state.seats.map((seat, idx) => {
            if (!seat)
                return null;
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
function serializeValidActions(va) {
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
function shortAddr(address) {
    if (address.length <= 10)
        return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
function formatAmount(amount) {
    const num = Number(amount);
    if (num >= 1_000_000)
        return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000)
        return `${(num / 1_000).toFixed(0)}K`;
    return num.toString();
}
// ===========================
// Exports
// ===========================
export { app, server, table, ledger };
export function startServer(port = 3001) {
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
//# sourceMappingURL=server.js.map