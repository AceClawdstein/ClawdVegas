/**
 * LLM-Powered Poker Agent
 *
 * Agents that use Claude to make decisions based on:
 * - Their hole cards and hand strength
 * - Community cards and board texture
 * - Opponent actions and betting patterns
 * - Chat messages (bluff detection)
 * - Pot odds and stack sizes
 */

import Anthropic from '@anthropic-ai/sdk';
import { type Card, cardDisplay } from '../engine/deck.js';
import { type ValidActions } from '../engine/betting.js';
import { evaluateHand, type HandResult } from '../engine/hand-eval.js';

// Initialize Anthropic client
const anthropic = new Anthropic();

// Agent personality types
export type AgentPersonality = 'shark' | 'maniac' | 'rock' | 'calling_station' | 'balanced';

export interface AgentConfig {
  name: string;
  address: string;
  personality: AgentPersonality;
}

// Track what's happened in the current hand
export interface HandHistory {
  actions: Array<{
    player: string;
    action: string;
    amount?: string;
    phase: string;
  }>;
  chat: Array<{
    player: string;
    message: string;
  }>;
}

// Full context for decision making
export interface DecisionContext {
  // My info
  myName: string;
  myCards: readonly Card[];
  myStack: string;
  myCurrentBet: string;

  // Table state
  communityCards: readonly Card[];
  pot: string;
  phase: string;

  // Other players
  opponents: Array<{
    name: string;
    stack: string;
    currentBet: string;
    isFolded: boolean;
    isAllIn: boolean;
  }>;

  // Valid actions
  validActions: ValidActions;

  // History this hand
  handHistory: HandHistory;

  // Position info
  isButton: boolean;
  position: 'early' | 'middle' | 'late' | 'blinds';
}

// Personality descriptions for the prompt
const PERSONALITY_PROMPTS: Record<AgentPersonality, string> = {
  shark: `You are a skilled, calculating poker player. You play tight-aggressive: selective with starting hands but aggressive when you enter a pot. You're excellent at reading opponents and exploiting weaknesses. You vary your play to stay unpredictable. You use chat strategically - sometimes to extract information, sometimes to put opponents on tilt.`,

  maniac: `You are an aggressive, unpredictable player who loves action. You play lots of hands and bet/raise frequently. You put maximum pressure on opponents and aren't afraid to bluff big. Your chat is confrontational and designed to provoke reactions. You thrive on chaos and making opponents uncomfortable.`,

  rock: `You are an extremely tight, patient player. You only play premium hands and rarely bluff. You wait for strong spots and maximize value when you have it. Your chat is minimal and cryptic - you let your cards do the talking. You're hard to read because you're so consistent.`,

  calling_station: `You are a curious player who hates folding. You call often to "see what happens" and rarely believe opponents have strong hands. You're friendly in chat but a bit naive about hand reading. You occasionally make surprisingly good calls by accident.`,

  balanced: `You are a well-rounded player with solid fundamentals. You mix up your play appropriately, bluffing at the right frequency and value betting correctly. Your chat is observant and analytical. You adjust to opponents and exploit imbalances in their play.`,
};

/**
 * Evaluate hand strength as a percentage (0-100)
 */
function getHandStrength(holeCards: readonly Card[], communityCards: readonly Card[]): { strength: number; handName: string; description: string } {
  if (communityCards.length === 0) {
    // Preflop hand strength (simplified)
    const [c1, c2] = holeCards;
    if (!c1 || !c2) return { strength: 20, handName: 'Unknown', description: 'No cards' };

    const isPair = c1.rank === c2.rank;
    const isSuited = c1.suit === c2.suit;
    const highCard = Math.max(rankToNum(c1.rank), rankToNum(c2.rank));
    const lowCard = Math.min(rankToNum(c1.rank), rankToNum(c2.rank));
    const gap = highCard - lowCard;

    let strength = 20;

    // Pairs
    if (isPair) {
      strength = 50 + highCard * 3;
      if (highCard >= 12) strength += 15; // QQ+
    } else {
      // High cards
      strength += highCard + lowCard / 2;
      if (isSuited) strength += 8;
      if (gap <= 2) strength += 5; // Connected
      if (highCard === 14 && lowCard >= 10) strength += 15; // AT+
      if (highCard === 13 && lowCard >= 10) strength += 10; // KT+
    }

    return {
      strength: Math.min(95, Math.max(10, strength)),
      handName: isPair ? `Pair of ${rankName(c1.rank)}s` : `${rankName(c1.rank)}-${rankName(c2.rank)}${isSuited ? ' suited' : ''}`,
      description: strength > 70 ? 'Premium hand' : strength > 50 ? 'Playable hand' : strength > 35 ? 'Speculative hand' : 'Weak hand',
    };
  }

  // Postflop - evaluate actual hand
  const allCards = [...holeCards, ...communityCards];
  const result = evaluateHand(allCards);

  // Convert hand rank to strength percentage
  const rankStrengths: Record<number, number> = {
    0: 25,  // High card
    1: 45,  // Pair
    2: 60,  // Two pair
    3: 70,  // Three of a kind
    4: 78,  // Straight
    5: 82,  // Flush
    6: 88,  // Full house
    7: 94,  // Four of a kind
    8: 99,  // Straight flush
  };

  return {
    strength: rankStrengths[result.rank] ?? 25,
    handName: result.rankName,
    description: `${result.rankName} (${result.bestFive.map(cardDisplay).join(' ')})`,
  };
}

function rankToNum(rank: string): number {
  const ranks: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return ranks[rank] ?? 0;
}

function rankName(rank: string): string {
  const names: Record<string, string> = {
    'T': 'Ten', 'J': 'Jack', 'Q': 'Queen', 'K': 'King', 'A': 'Ace',
  };
  return names[rank] ?? rank;
}

/**
 * Calculate pot odds
 */
function getPotOdds(callAmount: bigint, pot: bigint): number {
  if (callAmount === 0n) return 100;
  const totalPot = pot + callAmount;
  return Number((callAmount * 100n) / totalPot);
}

/**
 * Build the decision prompt for Claude
 */
function buildDecisionPrompt(context: DecisionContext, personality: AgentPersonality): string {
  const handStrength = getHandStrength(context.myCards, context.communityCards);
  const potOdds = getPotOdds(
    BigInt(context.validActions.callAmount),
    BigInt(context.pot)
  );

  // Format hand history
  const historyStr = context.handHistory.actions.length > 0
    ? context.handHistory.actions.map(a =>
        `${a.player} ${a.action}${a.amount ? ' $' + a.amount : ''} (${a.phase})`
      ).join('\n')
    : 'No actions yet this hand';

  // Format chat history
  const chatStr = context.handHistory.chat.length > 0
    ? context.handHistory.chat.map(c => `${c.player}: "${c.message}"`).join('\n')
    : 'No chat this hand';

  // Format opponents
  const opponentsStr = context.opponents
    .filter(o => !o.isFolded)
    .map(o => `${o.name}: $${o.stack} stack, $${o.currentBet} bet${o.isAllIn ? ' (ALL-IN)' : ''}`)
    .join('\n');

  // Format valid actions
  const actionsStr = [];
  if (context.validActions.canFold) actionsStr.push('FOLD');
  if (context.validActions.canCheck) actionsStr.push('CHECK');
  if (context.validActions.canCall) actionsStr.push(`CALL $${context.validActions.callAmount}`);
  if (context.validActions.canBet) actionsStr.push(`BET ($${context.validActions.minBet} - $${context.validActions.maxBet})`);
  if (context.validActions.canRaise) actionsStr.push(`RAISE ($${context.validActions.minRaise} - $${context.validActions.maxBet})`);

  return `You are ${context.myName}, playing No Limit Texas Hold'em poker.

${PERSONALITY_PROMPTS[personality]}

CURRENT SITUATION:
- Phase: ${context.phase.toUpperCase()}
- Position: ${context.position}${context.isButton ? ' (BUTTON)' : ''}
- Your cards: ${context.myCards.map(cardDisplay).join(' ')}
- Community cards: ${context.communityCards.length > 0 ? context.communityCards.map(cardDisplay).join(' ') : 'None yet'}
- Your hand: ${handStrength.handName} (${handStrength.description})
- Hand strength: ~${handStrength.strength}%

STACKS & POT:
- Your stack: $${context.myStack}
- Your current bet: $${context.myCurrentBet}
- Pot: $${context.pot}
- Pot odds to call: ${potOdds}%

OPPONENTS STILL IN HAND:
${opponentsStr || 'None (you win!)'}

ACTION THIS HAND:
${historyStr}

CHAT THIS HAND:
${chatStr}

VALID ACTIONS:
${actionsStr.join(', ')}

Based on your personality and the situation, decide your action. Consider:
1. Your hand strength vs likely opponent holdings
2. Pot odds and implied odds
3. Opponent tendencies based on their actions
4. Any tells from their chat messages
5. Your table image and how opponents perceive you

Respond with EXACTLY this JSON format:
{
  "thinking": "Brief analysis of the situation (2-3 sentences max)",
  "action": "fold" | "check" | "call" | "bet" | "raise",
  "amount": <number if betting/raising, omit otherwise>,
  "chat": "Optional trash talk or table talk (or null for silence)"
}`;
}

/**
 * Parse Claude's response into an action
 */
function parseDecision(response: string): { action: string; amount?: string; chat?: string; thinking?: string } {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', response);
      return { action: 'check' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      action: parsed.action || 'check',
      amount: parsed.amount?.toString(),
      chat: parsed.chat || undefined,
      thinking: parsed.thinking,
    };
  } catch (e) {
    console.error('Failed to parse LLM response:', e, response);
    return { action: 'check' };
  }
}

/**
 * Make a decision using Claude
 */
export async function makeDecision(
  context: DecisionContext,
  personality: AgentPersonality
): Promise<{ action: string; amount?: string; chat?: string; thinking?: string }> {
  const prompt = buildDecisionPrompt(context, personality);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const textBlock = response.content[0];
    if (!textBlock || textBlock.type !== 'text') {
      return { action: 'check' };
    }

    return parseDecision(textBlock.text);
  } catch (e) {
    console.error('LLM decision failed:', e);
    // Fallback to simple logic
    if (context.validActions.canCheck) return { action: 'check' };
    if (context.validActions.canCall) return { action: 'call' };
    return { action: 'fold' };
  }
}

/**
 * LLM Agent class that tracks history and makes decisions
 */
export class LLMAgent {
  public readonly name: string;
  public readonly address: string;
  public readonly personality: AgentPersonality;

  private handHistory: HandHistory = { actions: [], chat: [] };
  private opponentPatterns: Map<string, { raises: number; folds: number; calls: number; bluffs: number }> = new Map();

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.address = config.address;
    this.personality = config.personality;
  }

  /**
   * Record an action (call this for ALL players' actions)
   */
  recordAction(player: string, action: string, amount: string | undefined, phase: string): void {
    const entry: { player: string; action: string; amount?: string; phase: string } = { player, action, phase };
    if (amount !== undefined) {
      entry.amount = amount;
    }
    this.handHistory.actions.push(entry);

    // Track opponent patterns
    if (player !== this.name) {
      const pattern = this.opponentPatterns.get(player) || { raises: 0, folds: 0, calls: 0, bluffs: 0 };
      if (action === 'raise' || action === 'bet') pattern.raises++;
      else if (action === 'fold') pattern.folds++;
      else if (action === 'call') pattern.calls++;
      this.opponentPatterns.set(player, pattern);
    }
  }

  /**
   * Record a chat message
   */
  recordChat(player: string, message: string): void {
    this.handHistory.chat.push({ player, message });
  }

  /**
   * Reset for new hand
   */
  newHand(): void {
    this.handHistory = { actions: [], chat: [] };
  }

  /**
   * Make a decision
   */
  async decide(
    myCards: readonly Card[],
    myStack: string,
    myCurrentBet: string,
    communityCards: readonly Card[],
    pot: string,
    phase: string,
    opponents: Array<{ name: string; stack: string; currentBet: string; isFolded: boolean; isAllIn: boolean }>,
    validActions: ValidActions,
    isButton: boolean,
    position: 'early' | 'middle' | 'late' | 'blinds'
  ): Promise<{ action: string; amount?: string; chat?: string; thinking?: string }> {
    const context: DecisionContext = {
      myName: this.name,
      myCards,
      myStack,
      myCurrentBet,
      communityCards,
      pot,
      phase,
      opponents,
      validActions,
      handHistory: this.handHistory,
      isButton,
      position,
    };

    return makeDecision(context, this.personality);
  }
}

/**
 * Create a set of LLM agents for the demo
 */
export function createLLMAgents(): LLMAgent[] {
  const configs: AgentConfig[] = [
    { name: 'Shark', address: '0xDEMO000000000000000000000000000000000001', personality: 'shark' },
    { name: 'Maniac', address: '0xDEMO000000000000000000000000000000000002', personality: 'maniac' },
    { name: 'Rock', address: '0xDEMO000000000000000000000000000000000003', personality: 'rock' },
    { name: 'CallBot', address: '0xDEMO000000000000000000000000000000000004', personality: 'calling_station' },
    { name: 'ProBot', address: '0xDEMO000000000000000000000000000000000005', personality: 'balanced' },
    { name: 'WildCard', address: '0xDEMO000000000000000000000000000000000006', personality: 'maniac' },
  ];

  return configs.map(c => new LLMAgent(c));
}
