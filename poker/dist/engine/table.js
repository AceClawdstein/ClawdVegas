/**
 * PokerTable - Main game orchestrator for Texas Molt'em
 * Handles player actions, game flow, and event emission
 */
import { EventEmitter } from 'events';
import { createInitialState, startHand, dealCommunityCards, getPlayersInHand, findNextActivePosition, canStartHand, allPlayersAllIn, } from './state.js';
import { getValidActions, validateAction, applyAction, isBettingRoundComplete, } from './betting.js';
import { evaluateHand } from './hand-eval.js';
import { calculatePots, awardPots, consolidateAwards } from './pot.js';
/**
 * PokerTable - The main game controller
 */
export class PokerTable extends EventEmitter {
    state;
    chatHistory = [];
    handStartTimeout = null;
    constructor(config = {}) {
        super();
        this.state = createInitialState(config);
    }
    // ==================
    // State Queries
    // ==================
    getState() {
        return this.state;
    }
    /** Get state with hole cards hidden (for spectators who shouldn't see) */
    getPublicState() {
        const seats = this.state.seats.map(seat => {
            if (!seat)
                return null;
            return { ...seat, holeCards: null };
        });
        return { ...this.state, seats, deck: [] };
    }
    /** Get state for a specific player (only shows their hole cards) */
    getStateForPlayer(address) {
        const seats = this.state.seats.map(seat => {
            if (!seat)
                return null;
            if (seat.address === address)
                return seat;
            return { ...seat, holeCards: null };
        });
        return { ...this.state, seats, deck: [] };
    }
    getConfig() {
        return this.state.config;
    }
    getChatHistory(limit = 50) {
        return this.chatHistory.slice(-limit);
    }
    getPlayerBySeat(seatIndex) {
        return this.state.seats[seatIndex] ?? null;
    }
    getPlayerByAddress(address) {
        return this.state.seats.find(s => s?.address === address) ?? null;
    }
    getSeatByAddress(address) {
        return this.state.seats.findIndex(s => s?.address === address);
    }
    // ==================
    // Seating Actions
    // ==================
    /** Sit down at the table */
    sit(address, seatIndex, buyIn) {
        // Validate seat
        if (seatIndex < 0 || seatIndex >= this.state.config.maxSeats) {
            return { success: false, error: `Invalid seat ${seatIndex}` };
        }
        if (this.state.seats[seatIndex] !== null) {
            return { success: false, error: `Seat ${seatIndex} is occupied` };
        }
        // Validate not already seated
        if (this.state.seats.some(s => s?.address === address)) {
            return { success: false, error: 'Already seated at this table' };
        }
        // Validate buy-in
        if (buyIn < this.state.config.minBuyIn) {
            return { success: false, error: `Minimum buy-in is ${this.state.config.minBuyIn}` };
        }
        if (buyIn > this.state.config.maxBuyIn) {
            return { success: false, error: `Maximum buy-in is ${this.state.config.maxBuyIn}` };
        }
        const player = {
            address,
            seatIndex,
            stack: buyIn,
            holeCards: null,
            currentBet: 0n,
            totalInvested: 0n,
            isFolded: false,
            isAllIn: false,
            isSittingOut: false,
        };
        const newSeats = [...this.state.seats];
        newSeats[seatIndex] = player;
        this.state = { ...this.state, seats: newSeats };
        this.emit('player_sat', { address, seatIndex, stack: buyIn.toString() });
        // Check if we can start a hand
        this.maybeStartHand();
        return { success: true, data: { seat: player } };
    }
    /** Stand up from the table */
    stand(address) {
        const seatIndex = this.getSeatByAddress(address);
        if (seatIndex < 0) {
            return { success: false, error: 'Not seated at this table' };
        }
        const player = this.state.seats[seatIndex];
        // Can't stand during a hand if you have cards
        if (player.holeCards !== null && this.state.phase !== 'waiting' && this.state.phase !== 'complete') {
            return { success: false, error: 'Cannot leave during a hand. Fold first or wait for hand to complete.' };
        }
        const chips = player.stack;
        const newSeats = [...this.state.seats];
        newSeats[seatIndex] = null;
        this.state = { ...this.state, seats: newSeats };
        this.emit('player_stood', { address, seatIndex, chips: chips.toString() });
        return { success: true, data: { chips } };
    }
    /** Add chips to stack (rebuy) */
    addChips(address, amount) {
        const seatIndex = this.getSeatByAddress(address);
        if (seatIndex < 0) {
            return { success: false, error: 'Not seated at this table' };
        }
        const player = this.state.seats[seatIndex];
        const newStack = player.stack + amount;
        if (newStack > this.state.config.maxBuyIn) {
            return { success: false, error: `Maximum stack is ${this.state.config.maxBuyIn}` };
        }
        const newSeats = [...this.state.seats];
        newSeats[seatIndex] = { ...player, stack: newStack };
        this.state = { ...this.state, seats: newSeats };
        this.emit('chips_added', { address, seatIndex, amount: amount.toString(), newStack: newStack.toString() });
        return { success: true, data: { newStack } };
    }
    // ==================
    // Game Actions
    // ==================
    /** Take an action (fold, check, call, bet, raise, all_in) */
    act(address, action) {
        // Validate it's their turn
        const seatIndex = this.getSeatByAddress(address);
        if (seatIndex < 0) {
            return { success: false, error: 'Not seated at this table' };
        }
        if (seatIndex !== this.state.activePosition) {
            return { success: false, error: 'Not your turn' };
        }
        const player = this.state.seats[seatIndex];
        // Get valid actions
        const bettingPlayer = {
            address: player.address,
            stack: player.stack,
            currentBet: player.currentBet,
            isFolded: player.isFolded,
            isAllIn: player.isAllIn,
        };
        const validActions = getValidActions(bettingPlayer, this.state.bettingState, this.state.config.bigBlind);
        // Validate action
        const validation = validateAction(action, bettingPlayer, validActions);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        const validatedAction = validation.action;
        // Apply action to player
        let newPlayer = { ...player };
        let chipsDelta = 0n;
        switch (validatedAction.type) {
            case 'fold':
                newPlayer = { ...newPlayer, isFolded: true };
                break;
            case 'check':
                // No change
                break;
            case 'call':
                chipsDelta = validatedAction.amount;
                newPlayer = {
                    ...newPlayer,
                    stack: newPlayer.stack - chipsDelta,
                    currentBet: newPlayer.currentBet + chipsDelta,
                    totalInvested: newPlayer.totalInvested + chipsDelta,
                    isAllIn: newPlayer.stack - chipsDelta === 0n,
                };
                break;
            case 'bet':
            case 'raise':
            case 'all_in':
                chipsDelta = validatedAction.amount - newPlayer.currentBet;
                newPlayer = {
                    ...newPlayer,
                    stack: newPlayer.stack - chipsDelta,
                    currentBet: validatedAction.amount,
                    totalInvested: newPlayer.totalInvested + chipsDelta,
                    isAllIn: validatedAction.type === 'all_in' || newPlayer.stack - chipsDelta === 0n,
                };
                break;
        }
        // Update state
        const newSeats = [...this.state.seats];
        newSeats[seatIndex] = newPlayer;
        const newBettingState = applyAction(validatedAction, bettingPlayer, this.state.bettingState);
        this.state = {
            ...this.state,
            seats: newSeats,
            bettingState: newBettingState,
            lastAction: { address, action: validatedAction.type, amount: validatedAction.amount },
        };
        // Emit action event
        this.emit('player_acted', {
            seatIndex,
            address,
            action: validatedAction.type,
            amount: validatedAction.amount.toString(),
            newStack: newPlayer.stack.toString(),
        });
        // Advance the game
        this.advanceGame();
        return { success: true, data: { action: validatedAction } };
    }
    /** Send a chat message */
    chat(address, message) {
        const seatIndex = this.getSeatByAddress(address);
        if (seatIndex < 0) {
            return { success: false, error: 'Must be seated to chat' };
        }
        // Validate message
        if (!message || message.trim().length === 0) {
            return { success: false, error: 'Message cannot be empty' };
        }
        if (message.length > 280) {
            return { success: false, error: 'Message too long (max 280 characters)' };
        }
        const chatMessage = {
            seatIndex,
            address,
            message: message.trim(),
            timestamp: Date.now(),
        };
        this.chatHistory.push(chatMessage);
        if (this.chatHistory.length > 500) {
            this.chatHistory = this.chatHistory.slice(-500);
        }
        this.emit('chat', chatMessage);
        return { success: true, data: undefined };
    }
    // ==================
    // Game Flow
    // ==================
    maybeStartHand() {
        if (this.state.phase !== 'waiting' && this.state.phase !== 'complete') {
            return;
        }
        if (!canStartHand(this.state)) {
            return;
        }
        // Delay before starting hand
        if (this.handStartTimeout) {
            clearTimeout(this.handStartTimeout);
        }
        this.handStartTimeout = setTimeout(() => {
            this.startNewHand();
        }, 3000);
    }
    startNewHand() {
        const result = startHand(this.state);
        if (!result.success) {
            console.error('Failed to start hand:', result.error);
            return;
        }
        this.state = result.state;
        this.emitEvents(result.events);
        // Check if all players are all-in (run out all cards)
        if (allPlayersAllIn(this.state)) {
            this.runOutAllCards();
        }
    }
    advanceGame() {
        // Check if only one player remains (everyone else folded)
        const playersInHand = getPlayersInHand(this.state);
        if (playersInHand.length === 1) {
            this.awardPotToLastPlayer(playersInHand[0]);
            return;
        }
        // Check if betting round is complete
        const bettingPlayers = this.state.seats
            .filter((s) => s !== null && s.holeCards !== null)
            .map(p => ({
            address: p.address,
            stack: p.stack,
            currentBet: p.currentBet,
            isFolded: p.isFolded,
            isAllIn: p.isAllIn,
        }));
        if (isBettingRoundComplete(bettingPlayers, this.state.bettingState)) {
            // Check if all remaining players are all-in
            if (allPlayersAllIn(this.state)) {
                this.runOutAllCards();
                return;
            }
            // Move to next phase
            if (this.state.phase === 'river') {
                this.goToShowdown();
            }
            else {
                const result = dealCommunityCards(this.state);
                if (result.success) {
                    this.state = result.state;
                    this.emitEvents(result.events);
                }
            }
        }
        else {
            // Move to next player
            const nextPos = findNextActivePosition(this.state, this.state.activePosition);
            const deadline = Date.now() + this.state.config.actionTimeoutMs;
            this.state = {
                ...this.state,
                activePosition: nextPos,
                actionDeadline: deadline,
            };
            this.emit('action_on', { seatIndex: nextPos, deadline });
        }
    }
    runOutAllCards() {
        // Deal remaining community cards
        while (this.state.communityCards.length < 5) {
            const result = dealCommunityCards(this.state);
            if (result.success) {
                this.state = result.state;
                this.emitEvents(result.events);
            }
            else {
                break;
            }
        }
        this.goToShowdown();
    }
    awardPotToLastPlayer(winner) {
        // Calculate total pot
        const contributions = this.state.seats
            .filter((s) => s !== null && s.holeCards !== null)
            .map(p => ({
            address: p.address,
            totalInvested: p.totalInvested,
            isFolded: p.isFolded,
            isAllIn: p.isAllIn,
        }));
        const potState = calculatePots(contributions);
        // Award all to winner (no showdown needed)
        const winnings = potState.totalPot;
        const newSeats = [...this.state.seats];
        const winnerSeat = newSeats[winner.seatIndex];
        newSeats[winner.seatIndex] = {
            ...winnerSeat,
            stack: winnerSeat.stack + winnings,
        };
        this.emit('pot_awarded', {
            winners: [{ seatIndex: winner.seatIndex, amount: winnings.toString() }],
        });
        this.completeHand(newSeats);
    }
    goToShowdown() {
        const playersInHand = getPlayersInHand(this.state);
        // Evaluate all hands
        const handResults = [];
        const showdownHands = [];
        for (const player of playersInHand) {
            const allCards = [...player.holeCards, ...this.state.communityCards];
            const hand = evaluateHand(allCards);
            handResults.push({ player, hand });
            showdownHands.push({
                seatIndex: player.seatIndex,
                cards: player.holeCards,
                handName: hand.rankName,
            });
        }
        this.emit('showdown', { hands: showdownHands });
        // Calculate pots
        const contributions = this.state.seats
            .filter((s) => s !== null && s.holeCards !== null)
            .map(p => ({
            address: p.address,
            totalInvested: p.totalInvested,
            isFolded: p.isFolded,
            isAllIn: p.isAllIn,
        }));
        const potState = calculatePots(contributions);
        // Build hands map
        const hands = new Map();
        for (const { player, hand } of handResults) {
            hands.set(player.address, hand);
        }
        // Award pots
        const foldedPlayers = new Set(this.state.seats
            .filter((s) => s !== null && s.isFolded)
            .map(p => p.address));
        const awards = awardPots(potState, hands, foldedPlayers);
        const consolidated = consolidateAwards(awards);
        // Update player stacks
        const newSeats = [...this.state.seats];
        const winnerInfo = [];
        for (const [address, amount] of consolidated) {
            const seatIndex = this.getSeatByAddress(address);
            if (seatIndex >= 0) {
                const seat = newSeats[seatIndex];
                newSeats[seatIndex] = { ...seat, stack: seat.stack + amount };
                winnerInfo.push({ seatIndex, amount: amount.toString() });
            }
        }
        this.emit('pot_awarded', { winners: winnerInfo });
        this.completeHand(newSeats);
    }
    completeHand(newSeats) {
        // Clear hole cards and reset for next hand
        const clearedSeats = newSeats.map(seat => {
            if (!seat)
                return null;
            return {
                ...seat,
                holeCards: null,
                currentBet: 0n,
                totalInvested: 0n,
                isFolded: false,
                isAllIn: false,
            };
        });
        this.state = {
            ...this.state,
            phase: 'complete',
            seats: clearedSeats,
            communityCards: [],
            activePosition: -1,
            actionDeadline: null,
        };
        this.emit('hand_complete', { handNumber: this.state.handNumber });
        this.emit('phase_changed', { phase: 'complete' });
        // Start next hand after delay
        this.maybeStartHand();
    }
    emitEvents(events) {
        for (const event of events) {
            this.emit(event.type, event);
        }
    }
    /** Get valid actions for a player */
    getValidActionsFor(address) {
        const seatIndex = this.getSeatByAddress(address);
        if (seatIndex < 0)
            return null;
        if (seatIndex !== this.state.activePosition)
            return null;
        const player = this.state.seats[seatIndex];
        const bettingPlayer = {
            address: player.address,
            stack: player.stack,
            currentBet: player.currentBet,
            isFolded: player.isFolded,
            isAllIn: player.isAllIn,
        };
        return getValidActions(bettingPlayer, this.state.bettingState, this.state.config.bigBlind);
    }
}
/**
 * Create a new poker table instance
 */
export function createTable(config) {
    return new PokerTable(config);
}
//# sourceMappingURL=table.js.map