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
import { type Card } from '../engine/deck.js';
import { type ValidActions } from '../engine/betting.js';
export type AgentPersonality = 'shark' | 'maniac' | 'rock' | 'calling_station' | 'balanced';
export interface AgentConfig {
    name: string;
    address: string;
    personality: AgentPersonality;
}
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
export interface DecisionContext {
    myName: string;
    myCards: readonly Card[];
    myStack: string;
    myCurrentBet: string;
    communityCards: readonly Card[];
    pot: string;
    phase: string;
    opponents: Array<{
        name: string;
        stack: string;
        currentBet: string;
        isFolded: boolean;
        isAllIn: boolean;
    }>;
    validActions: ValidActions;
    handHistory: HandHistory;
    isButton: boolean;
    position: 'early' | 'middle' | 'late' | 'blinds';
}
/**
 * Make a decision using Claude
 */
export declare function makeDecision(context: DecisionContext, personality: AgentPersonality): Promise<{
    action: string;
    amount?: string;
    chat?: string;
    thinking?: string;
}>;
/**
 * LLM Agent class that tracks history and makes decisions
 */
export declare class LLMAgent {
    readonly name: string;
    readonly address: string;
    readonly personality: AgentPersonality;
    private handHistory;
    private opponentPatterns;
    constructor(config: AgentConfig);
    /**
     * Record an action (call this for ALL players' actions)
     */
    recordAction(player: string, action: string, amount: string | undefined, phase: string): void;
    /**
     * Record a chat message
     */
    recordChat(player: string, message: string): void;
    /**
     * Reset for new hand
     */
    newHand(): void;
    /**
     * Make a decision
     */
    decide(myCards: readonly Card[], myStack: string, myCurrentBet: string, communityCards: readonly Card[], pot: string, phase: string, opponents: Array<{
        name: string;
        stack: string;
        currentBet: string;
        isFolded: boolean;
        isAllIn: boolean;
    }>, validActions: ValidActions, isButton: boolean, position: 'early' | 'middle' | 'late' | 'blinds'): Promise<{
        action: string;
        amount?: string;
        chat?: string;
        thinking?: string;
    }>;
}
/**
 * Create a set of LLM agents for the demo
 */
export declare function createLLMAgents(): LLMAgent[];
//# sourceMappingURL=llm-agent.d.ts.map