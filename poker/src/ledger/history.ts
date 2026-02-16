/**
 * Opponent History System
 *
 * Tracks statistics and notes about opponents you've played against.
 * Persists to disk so agents can learn from past encounters.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Stats we track for each opponent
export interface OpponentStats {
  handsPlayed: number;
  handsWon: number;

  // Preflop stats
  vpip: number;        // Voluntarily Put $ In Pot (% of hands played)
  pfr: number;         // Preflop Raise %
  threeBet: number;    // 3-bet %
  foldTo3Bet: number;  // Fold to 3-bet %

  // Postflop stats
  aggression: number;  // (bets + raises) / calls
  cbet: number;        // Continuation bet %
  foldToCbet: number;  // Fold to c-bet %

  // Showdown stats
  wtsd: number;        // Went to Showdown %
  wsd: number;         // Won at Showdown %

  // Raw counts for calculating stats
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

// Default empty stats
function createEmptyStats(): OpponentStats {
  return {
    handsPlayed: 0,
    handsWon: 0,
    vpip: 0,
    pfr: 0,
    threeBet: 0,
    foldTo3Bet: 0,
    aggression: 0,
    cbet: 0,
    foldToCbet: 0,
    wtsd: 0,
    wsd: 0,
    _vpipOpportunities: 0,
    _vpipActions: 0,
    _pfrOpportunities: 0,
    _pfrActions: 0,
    _cbetOpportunities: 0,
    _cbetActions: 0,
    _showdownOpportunities: 0,
    _showdownWins: 0,
    _betsAndRaises: 0,
    _calls: 0,
  };
}

export class OpponentHistoryStore {
  private dataDir: string;
  private profiles: Map<string, OpponentProfile> = new Map();

  constructor(dataDir: string = './data/opponent-history') {
    this.dataDir = dataDir;
    this.ensureDataDir();
    this.loadAll();
  }

  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private getFilePath(address: string): string {
    // Sanitize address for filename
    const safe = address.toLowerCase().replace(/[^a-z0-9]/g, '');
    return join(this.dataDir, `${safe}.json`);
  }

  private loadAll(): void {
    // Load all existing profiles on startup
    try {
      const { readdirSync } = require('fs');
      const files = readdirSync(this.dataDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = readFileSync(join(this.dataDir, file), 'utf-8');
            const profile = JSON.parse(data) as OpponentProfile;
            this.profiles.set(profile.address.toLowerCase(), profile);
          } catch {
            // Skip corrupted files
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  private save(profile: OpponentProfile): void {
    const path = this.getFilePath(profile.address);
    writeFileSync(path, JSON.stringify(profile, null, 2));
  }

  /**
   * Get or create a profile for an opponent
   */
  getProfile(address: string): OpponentProfile {
    const key = address.toLowerCase();
    let profile = this.profiles.get(key);

    if (!profile) {
      profile = {
        address: address,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        stats: createEmptyStats(),
        notes: [],
        showdowns: [],
      };
      this.profiles.set(key, profile);
    }

    return profile;
  }

  /**
   * Record that a hand was played (updates lastSeen and handsPlayed)
   */
  recordHandPlayed(address: string): void {
    const profile = this.getProfile(address);
    profile.lastSeen = new Date().toISOString();
    profile.stats.handsPlayed++;
    this.save(profile);
  }

  /**
   * Record a VPIP (voluntarily put money in pot) opportunity
   */
  recordVpipOpportunity(address: string, didVpip: boolean): void {
    const profile = this.getProfile(address);
    profile.stats._vpipOpportunities++;
    if (didVpip) profile.stats._vpipActions++;
    profile.stats.vpip = profile.stats._vpipOpportunities > 0
      ? profile.stats._vpipActions / profile.stats._vpipOpportunities
      : 0;
    this.save(profile);
  }

  /**
   * Record a PFR (preflop raise) opportunity
   */
  recordPfrOpportunity(address: string, didRaise: boolean): void {
    const profile = this.getProfile(address);
    profile.stats._pfrOpportunities++;
    if (didRaise) profile.stats._pfrActions++;
    profile.stats.pfr = profile.stats._pfrOpportunities > 0
      ? profile.stats._pfrActions / profile.stats._pfrOpportunities
      : 0;
    this.save(profile);
  }

  /**
   * Record a c-bet opportunity
   */
  recordCbetOpportunity(address: string, didCbet: boolean): void {
    const profile = this.getProfile(address);
    profile.stats._cbetOpportunities++;
    if (didCbet) profile.stats._cbetActions++;
    profile.stats.cbet = profile.stats._cbetOpportunities > 0
      ? profile.stats._cbetActions / profile.stats._cbetOpportunities
      : 0;
    this.save(profile);
  }

  /**
   * Record an aggressive action (bet or raise)
   */
  recordAggression(address: string, action: 'bet' | 'raise' | 'call'): void {
    const profile = this.getProfile(address);
    if (action === 'bet' || action === 'raise') {
      profile.stats._betsAndRaises++;
    } else {
      profile.stats._calls++;
    }
    profile.stats.aggression = profile.stats._calls > 0
      ? profile.stats._betsAndRaises / profile.stats._calls
      : profile.stats._betsAndRaises;
    this.save(profile);
  }

  /**
   * Record a showdown
   */
  recordShowdown(
    address: string,
    handId: string,
    theirHand: string,
    myHand: string,
    board: string,
    pot: string,
    didWin: boolean
  ): void {
    const profile = this.getProfile(address);

    profile.stats._showdownOpportunities++;
    if (didWin) {
      profile.stats._showdownWins++;
      profile.stats.handsWon++;
    }

    profile.stats.wtsd = profile.stats.handsPlayed > 0
      ? profile.stats._showdownOpportunities / profile.stats.handsPlayed
      : 0;
    profile.stats.wsd = profile.stats._showdownOpportunities > 0
      ? profile.stats._showdownWins / profile.stats._showdownOpportunities
      : 0;

    // Keep last 50 showdowns
    profile.showdowns.push({
      handId,
      timestamp: new Date().toISOString(),
      theirHand,
      myHand,
      board,
      pot,
      result: didWin ? 'won' : 'lost',
    });
    if (profile.showdowns.length > 50) {
      profile.showdowns = profile.showdowns.slice(-50);
    }

    this.save(profile);
  }

  /**
   * Add a note about an opponent
   */
  addNote(address: string, note: string, handId?: string): void {
    const profile = this.getProfile(address);
    const noteEntry: OpponentNote = {
      timestamp: new Date().toISOString(),
      note,
    };
    if (handId !== undefined) {
      noteEntry.handId = handId;
    }
    profile.notes.push(noteEntry);
    // Keep last 100 notes
    if (profile.notes.length > 100) {
      profile.notes = profile.notes.slice(-100);
    }
    this.save(profile);
  }

  /**
   * Get all profiles (for display/export)
   */
  getAllProfiles(): OpponentProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get summary stats for quick display
   */
  getSummary(address: string): {
    handsPlayed: number;
    vpip: string;
    pfr: string;
    aggression: string;
    type: string;
  } {
    const profile = this.getProfile(address);
    const s = profile.stats;

    // Determine player type
    let type = 'Unknown';
    if (s.handsPlayed >= 10) {
      if (s.vpip < 0.20 && s.pfr < 0.15) {
        type = 'Rock';
      } else if (s.vpip < 0.28 && s.pfr > 0.15 && s.pfr < 0.25) {
        type = 'TAG';
      } else if (s.vpip > 0.30 && s.pfr > 0.25) {
        type = 'LAG';
      } else if (s.vpip > 0.40 && s.pfr < 0.15) {
        type = 'Calling Station';
      } else if (s.vpip > 0.50) {
        type = 'Maniac';
      } else {
        type = 'Regular';
      }
    }

    return {
      handsPlayed: s.handsPlayed,
      vpip: (s.vpip * 100).toFixed(1) + '%',
      pfr: (s.pfr * 100).toFixed(1) + '%',
      aggression: s.aggression.toFixed(2),
      type,
    };
  }
}

// Singleton instance
let store: OpponentHistoryStore | null = null;

export function getOpponentHistoryStore(dataDir?: string): OpponentHistoryStore {
  if (!store) {
    store = new OpponentHistoryStore(dataDir);
  }
  return store;
}
