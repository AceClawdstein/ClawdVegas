/**
 * Opponent History System
 *
 * Tracks statistics and notes about opponents you've played against.
 * Persists to disk so agents can learn from past encounters.
 */
export interface OpponentStats {
    handsPlayed: number;
    handsWon: number;
    vpip: number;
    pfr: number;
    threeBet: number;
    foldTo3Bet: number;
    aggression: number;
    cbet: number;
    foldToCbet: number;
    wtsd: number;
    wsd: number;
    _vpipOpportunities: number;
    _vpipActions: number;
    _pfrOpportunities: number;
    _pfrActions: number;
    _cbetOpportunities: number;
    _cbetActions: number;
    _showdownOpportunities: number;
    _showdownWins: number;
    _betsAndRaises: number;
    _calls: number;
}
export interface OpponentNote {
    timestamp: string;
    handId?: string;
    note: string;
}
export interface ShowdownRecord {
    handId: string;
    timestamp: string;
    theirHand: string;
    myHand: string;
    board: string;
    pot: string;
    result: 'won' | 'lost' | 'split';
}
export interface OpponentProfile {
    address: string;
    firstSeen: string;
    lastSeen: string;
    stats: OpponentStats;
    notes: OpponentNote[];
    showdowns: ShowdownRecord[];
}
export declare class OpponentHistoryStore {
    private dataDir;
    private profiles;
    constructor(dataDir?: string);
    private ensureDataDir;
    private getFilePath;
    private loadAll;
    private save;
    /**
     * Get or create a profile for an opponent
     */
    getProfile(address: string): OpponentProfile;
    /**
     * Record that a hand was played (updates lastSeen and handsPlayed)
     */
    recordHandPlayed(address: string): void;
    /**
     * Record a VPIP (voluntarily put money in pot) opportunity
     */
    recordVpipOpportunity(address: string, didVpip: boolean): void;
    /**
     * Record a PFR (preflop raise) opportunity
     */
    recordPfrOpportunity(address: string, didRaise: boolean): void;
    /**
     * Record a c-bet opportunity
     */
    recordCbetOpportunity(address: string, didCbet: boolean): void;
    /**
     * Record an aggressive action (bet or raise)
     */
    recordAggression(address: string, action: 'bet' | 'raise' | 'call'): void;
    /**
     * Record a showdown
     */
    recordShowdown(address: string, handId: string, theirHand: string, myHand: string, board: string, pot: string, didWin: boolean): void;
    /**
     * Add a note about an opponent
     */
    addNote(address: string, note: string, handId?: string): void;
    /**
     * Get all profiles (for display/export)
     */
    getAllProfiles(): OpponentProfile[];
    /**
     * Get summary stats for quick display
     */
    getSummary(address: string): {
        handsPlayed: number;
        vpip: string;
        pfr: string;
        aggression: string;
        type: string;
    };
}
export declare function getOpponentHistoryStore(dataDir?: string): OpponentHistoryStore;
//# sourceMappingURL=history.d.ts.map