# AGENTS.md — ClawdVegas Craps

## Project Overview

This is a real-money craps game for AI agents (Clawdbots) using $CLAWDVEGAS tokens on Base chain. The project has two phases:

1. **Phase 1:** Game engine + Agent API (backend)
2. **Phase 2:** Visual spectator experience (frontend)

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript
- **Framework:** Express.js for REST API
- **WebSocket:** ws library for real-time events
- **Blockchain:** Base (EVM), viem for contract interaction
- **Smart Contracts:** Solidity, Foundry for testing
- **Testing:** Vitest for unit tests

## Project Structure

```
craps/
├── src/
│   ├── engine/          # Craps game logic
│   │   ├── dice.ts      # Dice rolling with secure randomness
│   │   ├── state.ts     # Game state machine
│   │   ├── bets.ts      # Bet types and validation
│   │   ├── payouts.ts   # Odds and payout calculations
│   │   └── table.ts     # Main table orchestration
│   ├── api/             # REST + WebSocket API
│   │   ├── server.ts    # Express app setup
│   │   ├── routes/      # API route handlers
│   │   ├── ws.ts        # WebSocket server
│   │   └── auth.ts      # Wallet signature verification
│   ├── contract/        # Smart contract interaction
│   │   ├── abi.ts       # Contract ABI
│   │   └── client.ts    # Viem client for Base
│   └── narrator/        # Ace Clawdstein commentary
│       └── ace.ts       # Message generation
├── contracts/           # Solidity contracts
│   └── CrapsTable.sol
├── tests/               # Test files
├── scripts/             # Deployment and utility scripts
├── prd.json             # Ralph task tracking
├── progress.txt         # Ralph learnings
└── AGENTS.md            # This file
```

## Coding Conventions

### TypeScript
- Use strict mode
- Prefer `const` over `let`
- Use explicit return types on functions
- Use interfaces for data shapes, types for unions

### Naming
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

### Game Engine
- State machine transitions must be explicit and logged
- All monetary values stored as bigint (no floating point)
- Bet validation happens before any state mutation
- Every bet must have a unique ID (uuid)

### API
- All endpoints return JSON
- Errors follow format: `{ error: string, code: string }`
- Authentication required for all mutation endpoints
- Rate limit: 10 requests/second per wallet

### Smart Contract
- Use OpenZeppelin for standard patterns
- All external calls must be reentrancy-safe
- Events emitted for all state changes
- Amounts always in token's smallest unit (no decimals)

## Key Constants

```typescript
// Token
const CLAWDVEGAS_ADDRESS = "0xd484aab2440971960182a5bc648b57f0dd20eb07";
const HOUSE_WALLET = "0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7";

// Table Limits
const MIN_BET = 10_000n;          // 10,000 tokens
const MAX_BET = 1_000_000n;       // 1,000,000 tokens
const BANKROLL_WARNING = 1_000_000_000n;  // 1B tokens
const BANKROLL_PAUSE = 500_000_000n;      // 500M tokens

// Payouts (as fractions: [numerator, denominator])
const PAYOUTS = {
  PASS: [1, 1],
  DONT_PASS: [1, 1],
  COME: [1, 1],
  PLACE_4: [9, 5],
  PLACE_5: [7, 5],
  PLACE_6: [7, 6],
  PLACE_8: [7, 6],
  PLACE_9: [7, 5],
  PLACE_10: [9, 5],
  CE_CRAPS: [7, 1],
  CE_ELEVEN: [7, 1],
};
```

## Testing Requirements

- Unit tests for all bet types
- Unit tests for state machine transitions
- Integration tests for API endpoints
- Contract tests with Foundry
- All tests must pass before commit

## Common Patterns

### Handling Bets
```typescript
interface Bet {
  id: string;
  type: BetType;
  amount: bigint;
  player: string;  // wallet address
  placedAt: number;  // block number
  status: 'active' | 'won' | 'lost' | 'pushed';
}
```

### State Transitions
```typescript
type GamePhase =
  | 'waiting_for_shooter'
  | 'come_out_betting'
  | 'come_out_roll'
  | 'point_set_betting'
  | 'point_roll';

interface GameState {
  phase: GamePhase;
  point: number | null;
  shooter: string | null;
  bets: Bet[];
  lastRoll: [number, number] | null;
}
```

### Provably Fair Dice
Use commit-reveal scheme:
1. Server commits to seed hash before roll
2. Player provides entropy
3. Final roll = hash(serverSeed + playerEntropy) mod 6 + 1

## Known Issues / Gotchas

- Don't Pass bar-12: 12 on come-out is a push, not a win
- Come bets travel: when point hits, come bet moves to that number
- Place bets are "off" on come-out unless player says "working"
- C&E is two bets: half on Any Craps, half on Eleven

## Progress Notes

(Ralph will append learnings here)
