/**
 * Deck management for Texas Molt'em
 * Cards, shuffle, deal - the foundation of the poker engine
 */
import { randomInt } from 'crypto';
export const SUITS = ['h', 'd', 'c', 's'];
export const SUIT_NAMES = {
    h: 'Hearts',
    d: 'Diamonds',
    c: 'Clubs',
    s: 'Spades',
};
export const SUIT_SYMBOLS = {
    h: '♥',
    d: '♦',
    c: '♣',
    s: '♠',
};
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};
export const RANK_NAMES = {
    '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six',
    '7': 'Seven', '8': 'Eight', '9': 'Nine', 'T': 'Ten',
    'J': 'Jack', 'Q': 'Queen', 'K': 'King', 'A': 'Ace',
};
/**
 * Convert card to string representation (e.g., "Ah" = Ace of hearts)
 */
export function cardToString(card) {
    return `${card.rank}${card.suit}`;
}
/**
 * Parse string to card (e.g., "Ah" -> { rank: 'A', suit: 'h' })
 */
export function stringToCard(s) {
    if (s.length !== 2) {
        throw new Error(`Invalid card string: ${s}`);
    }
    const rank = s[0];
    const suit = s[1];
    if (!RANKS.includes(rank)) {
        throw new Error(`Invalid rank: ${rank}`);
    }
    if (!SUITS.includes(suit)) {
        throw new Error(`Invalid suit: ${suit}`);
    }
    return { rank, suit };
}
/**
 * Get human-readable card name (e.g., "Ace of Hearts")
 */
export function cardName(card) {
    return `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;
}
/**
 * Get display string with symbol (e.g., "A♥")
 */
export function cardDisplay(card) {
    return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}
/**
 * Create a fresh 52-card deck
 */
export function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ rank, suit });
        }
    }
    return deck;
}
/**
 * Shuffle deck using Fisher-Yates algorithm with crypto.randomInt
 * Returns a new shuffled array (does not mutate input)
 */
export function shuffleDeck(deck) {
    const shuffled = [...deck];
    // Fisher-Yates shuffle with cryptographically secure random
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
/**
 * Deal cards from the deck
 * Returns the dealt cards and the remaining deck
 */
export function dealCards(deck, count) {
    if (count > deck.length) {
        throw new Error(`Cannot deal ${count} cards from deck of ${deck.length}`);
    }
    return {
        dealt: deck.slice(0, count),
        remaining: deck.slice(count),
    };
}
/**
 * Deal hole cards to multiple players
 * Returns each player's 2 cards and the remaining deck
 */
export function dealHoleCards(deck, playerCount) {
    const cardsNeeded = playerCount * 2;
    if (cardsNeeded > deck.length) {
        throw new Error(`Cannot deal to ${playerCount} players from deck of ${deck.length}`);
    }
    const hands = [];
    let remaining = [...deck];
    // Deal one card at a time to each player (like real poker)
    for (let round = 0; round < 2; round++) {
        for (let p = 0; p < playerCount; p++) {
            if (round === 0) {
                hands.push([]);
            }
            hands[p].push(remaining[0]);
            remaining = remaining.slice(1);
        }
    }
    return { hands, remaining };
}
/**
 * Compare two cards by rank value
 */
export function compareCards(a, b) {
    return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
}
/**
 * Sort cards by rank (highest first)
 */
export function sortByRank(cards) {
    return [...cards].sort((a, b) => compareCards(b, a));
}
/**
 * Check if cards are same suit
 */
export function sameSuit(cards) {
    if (cards.length === 0)
        return true;
    const suit = cards[0].suit;
    return cards.every(c => c.suit === suit);
}
//# sourceMappingURL=deck.js.map