/**
 * Betting logic for No Limit Texas Hold'em
 * Handles valid actions, min/max raises, and betting round completion
 */
/**
 * Create initial betting state for a new betting round
 */
export function createBettingState(bigBlind) {
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
export function createBettingStateWithBlinds(bigBlind, bigBlindPlayer) {
    return {
        currentBet: bigBlind,
        minRaise: bigBlind,
        lastRaiser: bigBlindPlayer,
        lastRaiseSize: bigBlind,
        actedThisRound: new Set(), // Blinds don't count as "acting"
        allInPlayers: new Set(),
    };
}
/**
 * Get valid actions for a player
 */
export function getValidActions(player, bettingState, bigBlind) {
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
        ? player.stack + player.currentBet // All-in for less
        : minRaiseTotal;
    const maxBet = player.stack + player.currentBet; // All-in
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
export function validateAction(action, player, validActions) {
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
            return { valid: false, error: `Unknown action type: ${action.type}` };
    }
}
/**
 * Apply action to betting state
 * Returns new betting state
 */
export function applyAction(action, player, bettingState) {
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
export function isBettingRoundComplete(players, bettingState) {
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
export function resetForNewRound(bettingState, bigBlind) {
    return {
        currentBet: 0n,
        minRaise: bigBlind,
        lastRaiser: null,
        lastRaiseSize: bigBlind,
        actedThisRound: new Set(),
        allInPlayers: bettingState.allInPlayers, // All-in status persists
    };
}
//# sourceMappingURL=betting.js.map