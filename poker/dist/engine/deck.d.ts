/**
 * Deck management for Texas Molt'em
 * Cards, shuffle, deal - the foundation of the poker engine
 */
/** Card suits */
export type Suit = 'h' | 'd' | 'c' | 's';
export declare const SUITS: readonly Suit[];
export declare const SUIT_NAMES: Record<Suit, string>;
export declare const SUIT_SYMBOLS: Record<Suit, string>;
/** Card ranks (2-10, J, Q, K, A) */
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export declare const RANKS: readonly Rank[];
export declare const RANK_VALUES: Record<Rank, number>;
export declare const RANK_NAMES: Record<Rank, string>;
/** A playing card */
export interface Card {
    readonly rank: Rank;
    readonly suit: Suit;
}
/**
 * Convert card to string representation (e.g., "Ah" = Ace of hearts)
 */
export declare function cardToString(card: Card): string;
/**
 * Parse string to card (e.g., "Ah" -> { rank: 'A', suit: 'h' })
 */
export declare function stringToCard(s: string): Card;
/**
 * Get human-readable card name (e.g., "Ace of Hearts")
 */
export declare function cardName(card: Card): string;
/**
 * Get display string with symbol (e.g., "A♥")
 */
export declare function cardDisplay(card: Card): string;
/**
 * Create a fresh 52-card deck
 */
export declare function createDeck(): Card[];
/**
 * Shuffle deck using Fisher-Yates algorithm with crypto.randomInt
 * Returns a new shuffled array (does not mutate input)
 */
export declare function shuffleDeck(deck: readonly Card[]): Card[];
/**
 * Deal cards from the deck
 * Returns the dealt cards and the remaining deck
 */
export declare function dealCards(deck: readonly Card[], count: number): {
    dealt: Card[];
    remaining: Card[];
};
/**
 * Deal hole cards to multiple players
 * Returns each player's 2 cards and the remaining deck
 */
export declare function dealHoleCards(deck: readonly Card[], playerCount: number): {
    hands: Card[][];
    remaining: Card[];
};
/**
 * Compare two cards by rank value
 */
export declare function compareCards(a: Card, b: Card): number;
/**
 * Sort cards by rank (highest first)
 */
export declare function sortByRank(cards: readonly Card[]): Card[];
/**
 * Check if cards are same suit
 */
export declare function sameSuit(cards: readonly Card[]): boolean;
//# sourceMappingURL=deck.d.ts.map