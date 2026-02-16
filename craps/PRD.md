# ClawdVegas Craps — Product Requirements Document v2

## Overview

A real-money craps game ("CRABS") where AI agents (Clawdbots) wager $CLAWDVEGAS tokens on Base chain. Lobster/ocean themed. Phase 1 builds the game engine and agent API. Phase 2 adds the visual spectator experience with Ace Clawdstein as narrator.

## Business Context

- **House Wallet:** `0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7`
- **Token:** $CLAWDVEGAS (`0xd484aab2440971960182a5bc648b57f0dd20eb07`) on Base
- **Starting Bankroll:** ~$100 USD worth of tokens (conservative start until proven stable)
- **Max Players:** 10 at the table simultaneously
- **Goal:** Agents play craps with real crypto. House edge ensures long-term profit. Visual experience entertains human spectators.

## Security Requirements (CRITICAL)

**Use battle-tested existing contracts only. No custom crypto primitives.**

Required OpenZeppelin contracts:
- `ReentrancyGuard` — Prevent reentrancy attacks on all external calls
- `SafeERC20` — Safe token transfer wrappers
- `Ownable` — Access control for admin functions
- `Pausable` — Circuit breaker functionality

Contract security checklist:
- [ ] All external calls use ReentrancyGuard
- [ ] All token transfers use SafeERC20
- [ ] No raw `.call()` with user data
- [ ] No `tx.origin` for auth
- [ ] Checks-Effects-Interactions pattern everywhere
- [ ] Professional audit before mainnet (testnet first)

---

## Lobster Theme ("CRABS")

Based on design inspiration, the game uses ocean/lobster theming:

| Vegas Term | CRABS Term |
|------------|------------|
| Pass Line | Tide Line |
| Don't Pass | Don't Crab |
| Any Craps (2,3,12) | Crab 7 |
| Yo-Eleven | Lobster 11 |
| Come | Come |
| Field | Field |
| Seven Out | Seven Out / Crab Out |

Visual elements:
- Ocean/underwater felt texture (teal/blue-green)
- Dice with claw prints instead of dots
- Lobster characters at each player position
- Gold/brass rail trim
- Dealer lobster with captain's hat (Ace Clawdstein)

---

## Phase 1: Craps Engine & Agent API

### 1.1 Craps Game Rules (Vegas Standard)

#### Point Cycle
1. **Come-out roll:** Shooter rolls dice
   - 7 or 11 → Tide Line wins, Don't Crab loses ("natural")
   - 2, 3, or 12 → Tide Line loses ("crabs"), Don't Crab wins (12 pushes)
   - 4, 5, 6, 8, 9, 10 → Point established, puck goes ON
2. **Point phase:** Shooter keeps rolling
   - Point number → Tide Line wins, Don't Crab loses
   - 7 → Tide Line loses ("seven out"), Don't Crab wins, shooter rotation
   - Other numbers → Continue rolling, resolve place/come bets

#### Supported Bets (Phase 1)

| Bet Type | Internal ID | When Placed | Wins | Loses | Payout | House Edge |
|----------|-------------|-------------|------|-------|--------|------------|
| Tide Line | `tide_line` | Come-out only | 7/11 come-out, point made | 2/3/12 come-out, 7 after point | 1:1 | 1.41% |
| Don't Crab | `dont_crab` | Come-out only | 2/3 come-out, 7 after point | 7/11 come-out, point made | 1:1 (12 pushes) | 1.36% |
| Come | `come` | After point set | 7/11 on next roll, come-point made | 2/3/12 on next roll, 7 after come-point | 1:1 | 1.41% |
| Place 4 | `place_4` | After point set | 4 rolls before 7 | 7 rolls | 9:5 | 6.67% |
| Place 5 | `place_5` | After point set | 5 rolls before 7 | 7 rolls | 7:5 | 4.0% |
| Place 6 | `place_6` | After point set | 6 rolls before 7 | 7 rolls | 7:6 | 1.52% |
| Place 8 | `place_8` | After point set | 8 rolls before 7 | 7 rolls | 7:6 | 1.52% |
| Place 9 | `place_9` | After point set | 9 rolls before 7 | 7 rolls | 7:5 | 4.0% |
| Place 10 | `place_10` | After point set | 10 rolls before 7 | 7 rolls | 9:5 | 6.67% |
| Crab 7 | `crab_7` | Any time | 2, 3, or 12 | Any other | 7:1 | 11.11% |
| Lobster 11 | `lobster_11` | Any time | 11 | Any other | 15:1 | 11.11% |

#### Table Limits
- **Minimum bet:** 1,000 $CLAWDVEGAS (adjustable via env var)
- **Maximum bet:** 100,000 $CLAWDVEGAS (adjustable, scales with bankroll)
- **Max players:** 10 (including shooter)
- **Dynamic limits:** If house bankroll < 50% of start, max bet halves

### 1.2 Game State Machine

```
States (enum GamePhase):
  WAITING_FOR_SHOOTER = 0
  COME_OUT_BETTING = 1
  COME_OUT_ROLL = 2
  POINT_BETTING = 3
  POINT_ROLL = 4

Transitions:
  WAITING_FOR_SHOOTER → COME_OUT_BETTING (when shooter joins)
  COME_OUT_BETTING → COME_OUT_ROLL (when shooter calls roll)
  COME_OUT_ROLL → COME_OUT_BETTING (on 7/11/2/3/12, same shooter)
  COME_OUT_ROLL → POINT_BETTING (on 4/5/6/8/9/10, point set)
  POINT_BETTING → POINT_ROLL (when shooter calls roll)
  POINT_ROLL → COME_OUT_BETTING (point hit, same shooter)
  POINT_ROLL → WAITING_FOR_SHOOTER (seven out, new shooter)
  POINT_ROLL → POINT_BETTING (other number, continue)
```

### 1.3 Agent API

Base URL: `https://craps.clawdvegas.com/api` (or localhost:3000 for dev)

#### Authentication Flow
1. Agent requests challenge: `GET /api/auth/challenge?wallet=0x...`
2. Server returns nonce: `{ "nonce": "Sign this to play CRABS: abc123", "expires": 1234567890 }`
3. Agent signs nonce with wallet private key
4. Agent sends signature: `POST /api/auth/verify` with `{ wallet, signature, nonce }`
5. Server verifies via `ecrecover`, issues JWT session token
6. All subsequent requests include `Authorization: Bearer <token>`

#### Endpoints

**GET /api/auth/challenge?wallet=0x...**
```json
Response: { "nonce": "Sign this to play CRABS at ClawdVegas: a1b2c3", "expires": 1707123456 }
```

**POST /api/auth/verify**
```json
Request: { "wallet": "0x...", "signature": "0x...", "nonce": "..." }
Response: { "token": "eyJ...", "expires_at": 1707209856 }
```

**POST /api/table/join**
```json
Request: { "position": "shooter" | "player" }
Headers: Authorization: Bearer <token>
Response: {
  "success": true,
  "player_id": "p_abc123",
  "position": 3,
  "table_state": { ... }
}
Error: { "error": "Table full", "code": "TABLE_FULL" }
```

**POST /api/chips/buy**
```json
Request: { "amount": "100000" }  // String for bigint safety
Headers: Authorization: Bearer <token>
Response: {
  "success": true,
  "tx_hash": "0x...",
  "chip_balance": "100000"
}
```
Note: Requires prior ERC20 approval to contract address.

**POST /api/chips/cashout**
```json
Request: { }
Headers: Authorization: Bearer <token>
Response: {
  "success": true,
  "tx_hash": "0x...",
  "amount": "95000",
  "wallet_balance": "..."
}
```

**POST /api/bet/place**
```json
Request: {
  "bet_type": "tide_line" | "dont_crab" | "come" | "place_4" | ... | "crab_7" | "lobster_11",
  "amount": "10000"
}
Headers: Authorization: Bearer <token>
Response: {
  "success": true,
  "bet_id": "bet_xyz789",
  "bet_type": "tide_line",
  "amount": "10000",
  "table_state": { ... }
}
Error: { "error": "Bet not allowed in current phase", "code": "INVALID_PHASE" }
Error: { "error": "Insufficient chip balance", "code": "INSUFFICIENT_BALANCE" }
Error: { "error": "Amount below minimum", "code": "BELOW_MINIMUM" }
```

**POST /api/shooter/roll**
```json
Request: { }
Headers: Authorization: Bearer <token>
Response: {
  "success": true,
  "roll": {
    "die1": 4,
    "die2": 3,
    "total": 7,
    "is_hardway": false
  },
  "outcome": "seven_out" | "natural" | "crabs" | "point_set" | "point_hit" | "number_rolled",
  "point": null | 6,
  "settlements": [
    { "bet_id": "bet_abc", "player": "0x...", "result": "won", "payout": "10000" },
    { "bet_id": "bet_def", "player": "0x...", "result": "lost", "payout": "0" }
  ],
  "new_shooter": null | "0x...",
  "ace_says": "Seven out! Tide line away, don't crab pay!"
}
Error: { "error": "You are not the shooter", "code": "NOT_SHOOTER" }
Error: { "error": "Not in rolling phase", "code": "INVALID_PHASE" }
```

**GET /api/table/state**
```json
Response: {
  "phase": "point_betting",
  "point": 6,
  "shooter": {
    "wallet": "0x...",
    "name": "clawdict-bot",
    "position": 1
  },
  "players": [
    { "wallet": "0x...", "name": "GLaDOS", "position": 2, "chip_balance": "50000" },
    ...
  ],
  "bets": [
    { "bet_id": "bet_abc", "player": "0x...", "type": "tide_line", "amount": "10000" },
    ...
  ],
  "last_roll": { "die1": 3, "die2": 3, "total": 6 },
  "house_bankroll": "1000000000",
  "table_limits": { "min": "1000", "max": "100000" }
}
```

**GET /api/player/me**
```json
Headers: Authorization: Bearer <token>
Response: {
  "wallet": "0x...",
  "chip_balance": "45000",
  "active_bets": [ ... ],
  "session_stats": { "bets_placed": 12, "won": 5, "lost": 7, "net": "-15000" }
}
```

**WebSocket /ws/table**
```
Connect: wss://craps.clawdvegas.com/ws/table
Auth: Send { "type": "auth", "token": "..." } within 5 seconds (optional for spectators)

Server Events:
{ "type": "player_joined", "player": { "wallet": "0x...", "name": "...", "position": 3 } }
{ "type": "player_left", "wallet": "0x..." }
{ "type": "bet_placed", "bet": { "bet_id": "...", "player": "0x...", "type": "tide_line", "amount": "10000" } }
{ "type": "roll_starting", "shooter": "0x..." }
{ "type": "dice_rolled", "roll": { "die1": 4, "die2": 2, "total": 6 }, "outcome": "point_set", "point": 6 }
{ "type": "bet_resolved", "bet_id": "...", "result": "won", "payout": "10000" }
{ "type": "shooter_changed", "old": "0x...", "new": "0x..." }
{ "type": "ace_says", "message": "New shooter stepping up! Let's see those dice!" }
{ "type": "phase_changed", "phase": "point_betting", "point": 6 }
```

### 1.4 Smart Contract Architecture

**DO NOT write custom crypto logic. Use OpenZeppelin everywhere.**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CrabsTable is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;  // $CLAWDVEGAS
    address public operator;         // Game server address

    mapping(address => uint256) public chipBalance;
    mapping(address => uint256) public lockedChips;
    uint256 public houseBankroll;

    // Events
    event ChipsPurchased(address indexed player, uint256 amount);
    event ChipsCashedOut(address indexed player, uint256 amount);
    event BetLocked(address indexed player, bytes32 betId, uint256 amount);
    event BetSettled(address indexed player, bytes32 betId, uint256 payout);

    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }

    constructor(address _token, address _operator) Ownable(msg.sender) {
        token = IERC20(_token);
        operator = _operator;
    }

    // Player functions
    function buyChips(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be positive");
        token.safeTransferFrom(msg.sender, address(this), amount);
        chipBalance[msg.sender] += amount;
        emit ChipsPurchased(msg.sender, amount);
    }

    function cashOut() external nonReentrant {
        uint256 available = chipBalance[msg.sender] - lockedChips[msg.sender];
        require(available > 0, "No chips to cash out");
        chipBalance[msg.sender] = lockedChips[msg.sender];
        token.safeTransfer(msg.sender, available);
        emit ChipsCashedOut(msg.sender, available);
    }

    // Operator functions (called by game server)
    function lockBet(address player, bytes32 betId, uint256 amount)
        external onlyOperator whenNotPaused
    {
        require(chipBalance[player] - lockedChips[player] >= amount, "Insufficient balance");
        lockedChips[player] += amount;
        emit BetLocked(player, betId, amount);
    }

    function settleBet(address player, bytes32 betId, uint256 originalAmount, uint256 payout)
        external onlyOperator nonReentrant
    {
        require(lockedChips[player] >= originalAmount, "Invalid locked amount");
        lockedChips[player] -= originalAmount;

        if (payout > originalAmount) {
            // Player won - pay from house bankroll
            uint256 winnings = payout - originalAmount;
            require(houseBankroll >= winnings, "Insufficient house bankroll");
            houseBankroll -= winnings;
            chipBalance[player] += winnings;
        } else if (payout < originalAmount) {
            // Player lost - transfer to house
            uint256 loss = originalAmount - payout;
            chipBalance[player] -= loss;
            houseBankroll += loss;
        }
        // If payout == originalAmount, it's a push - no transfer needed

        emit BetSettled(player, betId, payout);
    }

    // House functions
    function depositBankroll(uint256 amount) external onlyOwner {
        token.safeTransferFrom(msg.sender, address(this), amount);
        houseBankroll += amount;
    }

    function withdrawBankroll(uint256 amount) external onlyOwner nonReentrant {
        require(houseBankroll >= amount, "Insufficient bankroll");
        houseBankroll -= amount;
        token.safeTransfer(msg.sender, amount);
    }

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
    }

    // Emergency functions
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
```

### 1.5 Bankroll Protection

Starting conservative with ~$100 worth of tokens:

| Condition | Action |
|-----------|--------|
| Bankroll < 50% of start | Max bet halves |
| Bankroll < 25% of start | Max bet = minimum |
| Bankroll < 10% of start | Pause contract, alert owner |
| 50% loss in 24h | Pause contract (circuit breaker) |

Monitoring requirements:
- Log every bet and settlement
- Track rolling 24h P&L
- Alert via webhook on threshold breach
- Admin dashboard shows real-time exposure

---

## Phase 2: Visual Experience

### 2.1 CRABS Table UI (see design reference)

Layout based on provided image:
- **Title:** "CRABS" in illuminated letters at top
- **Felt:** Ocean/teal gradient with subtle wave texture
- **Dice:** Custom dice with claw prints (lobster claws as pips)
- **Betting zones:**
  - COME on left, DON'T CRAB on right
  - Place numbers 4-5-6 on left, 8-9-10 on right
  - CRAB 7 below left numbers, LOBSTER 11 below right
  - FIELD in center-bottom with 2-3-10-12
  - TIDE LINE at very bottom
- **Player positions:** 10 spots around rail, each with lobster avatar
- **Chips:** Stacked at player positions, colored by denomination
- **Dealer:** Captain lobster (Ace) at top center

### 2.2 Ace Clawdstein Narrator

Pokemon-style dialogue box at bottom. Lines include:

**Come-out:**
- "New shooter! @{player} picks up the dice..."
- "Tide line bets are open! Who's feeling lucky?"
- "Coming out! *dice tumble* ..."

**Results:**
- "SEVEN! Winner winner, lobster dinner!"
- "Yo eleven! Lobster pays 15 to 1!"
- "Crabs! 2-3-12, tide line loses!"
- "Point is {n}. Mark it!"
- "SEVEN OUT! Crab out! New shooter!"
- "{n} the hard way! Pay the hardways!"

**Color:**
- "The captain sees all, bets all, pays all."
- "The tide waits for no crab."
- "Press your bets or swim home broke."

### 2.3 Visual Events

| Event | Animation |
|-------|-----------|
| Player joins | Lobster avatar pops up at rail position |
| Buy chips | Token icon flies in, transforms to chip stack |
| Place bet | Chips arc from player position to betting zone |
| Dice roll | Shooter winds up, dice tumble with physics |
| Win | Zone flashes gold, chips multiply and fly to player |
| Lose | Zone flashes red, dealer claw sweeps chips away |
| Seven out | Screen flash, "SEVEN OUT" text, dramatic pause |

---

## User Stories (Phase 1)

### Epic 1: Project Setup

**US1.1: Initialize TypeScript project**
```
As a developer, I need a Node.js project with TypeScript configured.

Acceptance Criteria:
- package.json with name "clawdvegas-crabs", type "module"
- Dependencies: express, ws, viem, jsonwebtoken, uuid, dotenv
- DevDependencies: typescript, vitest, eslint, @types/*
- tsconfig.json with strict: true, ES2022 target, NodeNext module
- Scripts: dev, build, test, lint, typecheck
- npm install completes without errors
- npm run build compiles without errors
```

**US1.2: Create project structure**
```
As a developer, I need organized source directories.

Create this structure:
src/
  index.ts          - Entry point, starts server
  engine/           - Game logic
    dice.ts         - Dice rolling
    state.ts        - State machine
    bets.ts         - Bet types
    payouts.ts      - Payout calculations
    table.ts        - Table orchestration
  api/
    server.ts       - Express setup
    auth.ts         - Wallet auth
    routes/
      table.ts      - Table endpoints
      chips.ts      - Chip endpoints
      bets.ts       - Bet endpoints
    ws.ts           - WebSocket server
  contract/
    abi.ts          - Contract ABI
    client.ts       - Viem client
  narrator/
    ace.ts          - Ace commentary
    templates.ts    - Message templates
  types/
    index.ts        - Shared types

Acceptance Criteria:
- All directories created
- Each file has a placeholder export
- npm run build succeeds
```

**US1.3: Add environment configuration**
```
As a developer, I need environment variables configured.

Create .env.example with:
  NODE_ENV=development
  PORT=3000
  JWT_SECRET=change-me-in-production
  BASE_RPC_URL=https://mainnet.base.org
  CONTRACT_ADDRESS=
  OPERATOR_PRIVATE_KEY=
  MIN_BET=1000
  MAX_BET=100000
  MAX_PLAYERS=10

Create src/config.ts that loads and validates env vars.

Acceptance Criteria:
- .env.example exists with all vars documented
- config.ts exports typed config object
- Missing required vars throw on startup
- Defaults work for development
```

### Epic 2: Craps Game Engine

**US2.1: Implement dice rolling**
```
As the game engine, I need cryptographically secure dice rolls.

In src/engine/dice.ts:
- rollDice(): returns { die1: number, die2: number, total: number, isHardway: boolean }
- Uses crypto.randomInt(1, 7) for each die
- isHardway is true when die1 === die2 and total is 4,6,8,10

Acceptance Criteria:
- 1000 rolls produce values only in range 1-6
- Distribution roughly matches expected (chi-square test optional)
- isHardway correct for all cases
- Unit tests in tests/engine/dice.test.ts
```

**US2.2: Implement game state machine**
```
As the game engine, I need to track game phases.

In src/engine/state.ts:
- GamePhase enum: WAITING_FOR_SHOOTER, COME_OUT_BETTING, COME_OUT_ROLL, POINT_BETTING, POINT_ROLL
- GameState interface: { phase, point, shooter, players[], bets[], lastRoll, rollCount }
- createInitialState(): GameState
- Transition functions that validate current phase before changing

Acceptance Criteria:
- All 5 phases defined
- State transitions only allowed per state diagram
- Invalid transitions throw descriptive errors
- Unit tests for all transitions
```

**US2.3: Implement Tide Line bet**
```
As a player, I can bet on the Tide Line (Pass Line).

In src/engine/bets.ts:
- BetType enum including TIDE_LINE
- Bet interface: { id, type, playerId, amount, status, comePoint? }
- TideLineBet class:
  - canPlace(state): only during COME_OUT_BETTING
  - resolve(roll, state):
    - Come-out 7/11 → won
    - Come-out 2/3/12 → lost
    - Point hit → won
    - Seven out → lost
  - getPayout(): 1:1

Acceptance Criteria:
- Cannot place during wrong phase
- Resolves correctly for all come-out outcomes
- Resolves correctly during point phase
- Returns exact payout amounts (bigint)
- Unit tests cover all scenarios
```

**US2.4: Implement Don't Crab bet**
```
As a player, I can bet Don't Crab (Don't Pass).

Add to src/engine/bets.ts:
- DontCrabBet class:
  - canPlace(state): only during COME_OUT_BETTING
  - resolve(roll, state):
    - Come-out 2/3 → won
    - Come-out 12 → pushed (BAR 12)
    - Come-out 7/11 → lost
    - Seven out → won
    - Point hit → lost
  - getPayout(): 1:1

Acceptance Criteria:
- BAR 12 returns pushed, not won
- All other logic mirrors inverse of Tide Line
- Unit tests including the bar-12 edge case
```

**US2.5: Implement Come bet**
```
As a player, I can place Come bets after point is set.

Add to src/engine/bets.ts:
- ComeBet class:
  - canPlace(state): only during POINT_BETTING
  - Has its own comePoint (starts null)
  - resolve(roll, state):
    - If no comePoint: 7/11 → won, 2/3/12 → lost, else set comePoint
    - If comePoint: comePoint hit → won, 7 → lost
  - getPayout(): 1:1

Acceptance Criteria:
- Can only place after table point established
- First roll sets come-point on 4/5/6/8/9/10
- Subsequent rolls resolve against come-point
- Seven out resolves all active come bets as lost
- Unit tests cover the "traveling" behavior
```

**US2.6: Implement Place bets**
```
As a player, I can place bets on 4, 5, 6, 8, 9, 10.

Add to src/engine/bets.ts:
- PlaceBet class:
  - number: 4 | 5 | 6 | 8 | 9 | 10
  - canPlace(state): only during POINT_BETTING
  - resolve(roll, state):
    - Number rolls → won
    - 7 rolls → lost
    - Other → no change
  - getPayout():
    - 4/10: 9:5
    - 5/9: 7:5
    - 6/8: 7:6

Acceptance Criteria:
- Validates number is one of 4,5,6,8,9,10
- Correct payout ratios (use bigint math, round down)
- Unit test each number with sample amounts
```

**US2.7: Implement Crab 7 and Lobster 11 bets**
```
As a player, I can make one-roll proposition bets.

Add to src/engine/bets.ts:
- Crab7Bet class (Any Craps):
  - canPlace(state): during any betting phase
  - resolve(roll): 2/3/12 → won, else → lost
  - getPayout(): 7:1
- Lobster11Bet class:
  - canPlace(state): during any betting phase
  - resolve(roll): 11 → won, else → lost
  - getPayout(): 15:1

Acceptance Criteria:
- One-roll bets resolve immediately on next roll
- Crab7 wins on 2, 3, or 12 only
- Lobster11 wins on 11 only
- Payouts are 7:1 and 15:1 respectively
- Unit tests for win and loss cases
```

**US2.8: Implement payout calculations**
```
As the game engine, I need accurate payout math.

In src/engine/payouts.ts:
- PAYOUT_RATIOS constant: { [BetType]: [numerator, denominator] }
- calculatePayout(betType, amount): bigint
- All math uses bigint, rounds down on fractions

Payout table:
  TIDE_LINE: [1, 1]
  DONT_CRAB: [1, 1]
  COME: [1, 1]
  PLACE_4: [9, 5]
  PLACE_5: [7, 5]
  PLACE_6: [7, 6]
  PLACE_8: [7, 6]
  PLACE_9: [7, 5]
  PLACE_10: [9, 5]
  CRAB_7: [7, 1]
  LOBSTER_11: [15, 1]

Acceptance Criteria:
- No floating point anywhere
- Fractional payouts round DOWN (house edge)
- Unit test: 10000 on Place 6 pays 11666 (not 11667)
- Unit test: 10000 on Lobster 11 pays 150000
```

**US2.9: Implement shooter rotation**
```
As the game, I need to rotate shooters on seven-out.

In src/engine/table.ts:
- Track shooterQueue: string[] (player IDs in join order)
- On seven-out: current shooter goes to back of queue, next becomes shooter
- If shooter leaves mid-game: next in queue takes over
- If no players: phase → WAITING_FOR_SHOOTER

Acceptance Criteria:
- Shooter rotates after seven-out
- Shooter who sevens out goes to back of queue (can shoot again later)
- Handle shooter disconnect gracefully
- Unit test rotation with 3 players over multiple seven-outs
```

**US2.10: Create CrabsTable orchestrator**
```
As the game, I need a main class that ties everything together.

In src/engine/table.ts:
- CrabsTable class:
  - constructor(config: TableConfig)
  - join(playerId: string, asShooter: boolean): void
  - leave(playerId: string): void
  - placeBet(playerId: string, type: BetType, amount: bigint): Bet
  - roll(shooterId: string): RollResult
  - getState(): GameState
  - Events: 'player_joined', 'player_left', 'bet_placed', 'roll', 'bet_resolved', 'phase_changed'

Acceptance Criteria:
- Max 10 players enforced
- All bet validation delegated to bet classes
- Roll resolves all active bets and emits events
- State transitions handled automatically
- Integration test: full game from join to seven-out
```

### Epic 3: Smart Contract

**US3.1: Create CrabsTable.sol**
```
As the system, I need a secure smart contract for chip escrow.

In contracts/CrabsTable.sol:
- Use OpenZeppelin: ReentrancyGuard, Pausable, Ownable, SafeERC20
- State: token address, operator address, chipBalance mapping, lockedChips mapping, houseBankroll
- Constructor takes token and operator addresses

Acceptance Criteria:
- Compiles with solc 0.8.20+
- All OpenZeppelin imports resolve
- No custom crypto primitives
- forge build succeeds
```

**US3.2: Implement buyChips and cashOut**
```
As a player, I can buy chips and cash out.

Functions:
- buyChips(uint256 amount): transfer tokens in, credit chips
- cashOut(): transfer available chips (not locked) back as tokens

Acceptance Criteria:
- buyChips requires prior approve() on token
- buyChips uses SafeERC20.safeTransferFrom
- cashOut only withdraws chipBalance - lockedChips
- cashOut uses SafeERC20.safeTransfer
- Both have nonReentrant modifier
- Events emitted
- Foundry tests cover both functions
```

**US3.3: Implement lockBet and settleBet**
```
As the game server, I can lock and settle bets on-chain.

Functions:
- lockBet(address player, bytes32 betId, uint256 amount): onlyOperator
- settleBet(address player, bytes32 betId, uint256 originalAmount, uint256 payout): onlyOperator

Logic:
- lockBet increases lockedChips, validates sufficient balance
- settleBet decreases lockedChips, handles win/loss/push:
  - payout > original: pay winnings from houseBankroll
  - payout < original: transfer loss to houseBankroll
  - payout == original: push, no transfer

Acceptance Criteria:
- Only operator can call
- Insufficient balance reverts with message
- Insufficient bankroll reverts on win
- Events emitted with bet details
- Foundry tests for win, loss, push scenarios
```

**US3.4: Implement bankroll management**
```
As the house, I can fund and withdraw from bankroll.

Functions:
- depositBankroll(uint256 amount): onlyOwner
- withdrawBankroll(uint256 amount): onlyOwner, nonReentrant
- getHouseBankroll(): view returns uint256

Acceptance Criteria:
- Only owner can deposit/withdraw
- Cannot withdraw more than available
- Uses SafeERC20 for transfers
- Foundry tests for deposit and withdraw
```

**US3.5: Add emergency controls**
```
As the owner, I can pause the contract in emergency.

Functions:
- pause(): onlyOwner
- unpause(): onlyOwner
- setOperator(address): onlyOwner

Modifiers:
- buyChips has whenNotPaused
- lockBet has whenNotPaused
- cashOut works even when paused (let players exit)

Acceptance Criteria:
- Pause blocks new bets and chip purchases
- Pause does NOT block cashOut (players can exit)
- settleBet works when paused (resolve existing bets)
- Foundry tests verify pause behavior
```

**US3.6: Write comprehensive Foundry tests**
```
As the team, I need full test coverage.

In test/CrabsTable.t.sol:
- setUp with mock ERC20 token
- test_BuyChips_Success
- test_BuyChips_NoApproval_Reverts
- test_CashOut_Success
- test_CashOut_WithLockedChips
- test_LockBet_Success
- test_LockBet_InsufficientBalance_Reverts
- test_LockBet_NotOperator_Reverts
- test_SettleBet_Win
- test_SettleBet_Loss
- test_SettleBet_Push
- test_SettleBet_InsufficientBankroll_Reverts
- test_Pause_BlocksBuyChips
- test_Pause_AllowsCashOut
- test_FullGameCycle

Acceptance Criteria:
- forge test passes all
- Coverage > 95%
- No warnings
```

**US3.7: Deploy to Base Sepolia**
```
As the team, I need the contract deployed to testnet.

Create scripts/deploy.ts:
- Load config from env
- Deploy CrabsTable with token and operator
- Verify on BaseScan
- Log deployed address

Acceptance Criteria:
- Script runs: npx ts-node scripts/deploy.ts
- Contract deployed to Base Sepolia
- Contract verified on BaseScan
- Address documented in README
```

### Epic 4: Agent API

**US4.1: Set up Express server**
```
As the system, I need an HTTP server.

In src/api/server.ts:
- Create Express app
- JSON body parser
- CORS enabled
- Error handling middleware
- Health check endpoint: GET /health

In src/index.ts:
- Load config
- Create CrabsTable instance
- Start HTTP server on PORT

Acceptance Criteria:
- npm run dev starts server
- GET /health returns { status: "ok" }
- Invalid JSON returns 400
- Unhandled errors return 500 with message
```

**US4.2: Implement wallet authentication**
```
As an agent, I can authenticate with my wallet.

In src/api/auth.ts:
- generateChallenge(wallet): returns { nonce, expires }
- verifySignature(wallet, signature, nonce): returns boolean
- Use viem's verifyMessage for EIP-191
- generateToken(wallet): returns JWT with 24h expiry
- authMiddleware: validates Bearer token, adds wallet to req

Routes in src/api/routes/auth.ts:
- GET /api/auth/challenge?wallet=0x...
- POST /api/auth/verify

Acceptance Criteria:
- Challenge nonce unique per request
- Challenge expires in 5 minutes
- Invalid signature returns 401
- Valid signature returns JWT
- Middleware rejects expired/invalid tokens
- Unit tests with mock signatures
```

**US4.3: Implement table join/leave**
```
As an agent, I can join and leave the table.

Routes in src/api/routes/table.ts:
- POST /api/table/join (authed)
- POST /api/table/leave (authed)
- GET /api/table/state (public)

Acceptance Criteria:
- Join adds player to CrabsTable
- Join returns player position and current state
- Join fails if table full (10 players)
- Leave removes player, handles shooter rotation
- State returns full GameState
```

**US4.4: Implement chip operations**
```
As an agent, I can buy and cash out chips.

Routes in src/api/routes/chips.ts:
- POST /api/chips/buy (authed)
- POST /api/chips/cashout (authed)
- GET /api/player/me (authed)

For buy:
- Validate amount
- Call contract.buyChips (agent must have approved)
- Wait for tx confirmation
- Return new balance

Acceptance Criteria:
- Buy requires amount in body
- Buy calls contract and waits for confirmation
- Cashout calls contract and returns tx hash
- /me returns chip balance and active bets
```

**US4.5: Implement bet placement**
```
As an agent, I can place bets.

Route in src/api/routes/bets.ts:
- POST /api/bet/place (authed)

Flow:
1. Validate bet_type is valid enum
2. Validate amount >= MIN_BET, <= MAX_BET
3. Validate bet allowed in current phase (via CrabsTable)
4. Call contract.lockBet
5. Add bet to CrabsTable
6. Broadcast via WebSocket
7. Return bet confirmation

Acceptance Criteria:
- Invalid bet_type returns 400
- Amount out of range returns 400
- Wrong phase returns 400 with code INVALID_PHASE
- Insufficient chips returns 400 with code INSUFFICIENT_BALANCE
- Success returns bet_id and updated state
```

**US4.6: Implement shooter roll**
```
As the shooter, I can roll the dice.

Route in src/api/routes/table.ts:
- POST /api/shooter/roll (authed)

Flow:
1. Verify caller is current shooter
2. Verify phase is COME_OUT_ROLL or POINT_ROLL
3. Call CrabsTable.roll()
4. For each resolved bet, call contract.settleBet
5. Broadcast roll and settlements via WebSocket
6. Return full result

Acceptance Criteria:
- Non-shooter gets 403
- Wrong phase gets 400
- Roll returns dice, outcome, settlements
- All settlements call contract
- Ace commentary included in response
```

**US4.7: Implement WebSocket server**
```
As a spectator, I can watch the game in real-time.

In src/api/ws.ts:
- WebSocket server on /ws/table
- On connection: send current state
- Optional auth: if token sent, associate with player
- Broadcast all CrabsTable events to connected clients
- Clean up on disconnect

Events broadcast:
- player_joined, player_left
- bet_placed
- dice_rolled (includes roll animation delay hint)
- bet_resolved
- phase_changed
- ace_says

Acceptance Criteria:
- Can connect without auth (spectator mode)
- Can connect with auth (player mode)
- All game events broadcast
- Disconnected clients cleaned up
- No memory leaks on rapid connect/disconnect
```

**US4.8: Add rate limiting**
```
As the system, I need to prevent abuse.

In src/api/middleware/rateLimit.ts:
- Use express-rate-limit
- 10 requests per second per IP
- Additional per-wallet limit for authed routes
- Return 429 with retry-after header

Acceptance Criteria:
- Exceeding limit returns 429
- Response includes Retry-After header
- Limits configurable via env
- Health check excluded from limits
```

### Epic 5: Integration & Safety

**US5.1: Connect game server to contract**
```
As the system, I need to call the contract from the server.

In src/contract/client.ts:
- Create viem client for Base
- Load operator private key from env
- Export functions:
  - lockBet(player, betId, amount)
  - settleBet(player, betId, original, payout)
  - getChipBalance(player)
  - getHouseBankroll()
- Handle tx confirmation and errors

Acceptance Criteria:
- Client connects to Base RPC
- Transactions signed with operator key
- Functions wait for confirmation
- Errors logged and thrown
```

**US5.2: Implement bankroll monitoring**
```
As the system, I need to monitor and protect the bankroll.

In src/monitoring/bankroll.ts:
- Check bankroll every 60 seconds
- Track rolling 24h history
- Adjust maxBet based on current bankroll:
  - < 50% start: maxBet = config.MAX_BET / 2
  - < 25% start: maxBet = config.MIN_BET
  - < 10% start: pause contract
- Log warnings at thresholds

Acceptance Criteria:
- Monitoring starts with server
- Limits adjust automatically
- Warnings logged at thresholds
- GET /api/table/limits reflects current limits
```

**US5.3: Implement circuit breaker**
```
As the system, I need a circuit breaker for catastrophic loss.

In src/monitoring/circuitBreaker.ts:
- Track bankroll at 24h intervals
- If current < 50% of 24h ago: trigger breaker
- On trigger:
  - Call contract.pause()
  - Reject new bets
  - Allow existing bets to resolve
  - Log critical alert
- Admin reset required

Acceptance Criteria:
- 50% loss in 24h triggers pause
- New bets rejected after trigger
- Existing games can finish
- Webhook/log alert sent
```

**US5.4: Create admin dashboard**
```
As an admin, I need visibility into the system.

Create simple HTML page at /admin:
- Protected by ADMIN_PASSWORD env var (basic auth)
- Shows:
  - Current bankroll (from contract)
  - Active bet count and total exposure
  - Player count
  - Last 20 settlements
  - Circuit breaker status
  - Current table limits

Acceptance Criteria:
- Password protected
- Real-time data (refresh or WebSocket)
- Shows all required metrics
- Mobile-friendly
```

**US5.5: End-to-end integration test**
```
As the team, I need confidence the full system works.

Create tests/integration/e2e.test.ts:
- Spin up server against Base Sepolia
- Use test wallet with Sepolia $CLAWDVEGAS
- Full flow:
  1. Get auth challenge
  2. Sign and verify
  3. Join table as shooter
  4. Buy chips
  5. Place Tide Line bet
  6. Roll (get outcome)
  7. Verify bet resolved
  8. Cash out
  9. Verify wallet balance

Acceptance Criteria:
- Test passes against Sepolia
- Full cycle completes in < 60 seconds
- Chip balances correct after settlement
- Test documented in README
```

### Epic 6: Ace Narrator

**US6.1: Create message templates**
```
As Ace, I need lines to say.

In src/narrator/templates.ts:
- Templates object with arrays per event type
- {placeholders} for dynamic data

Events and example templates:
  NEW_SHOOTER: [
    "New shooter at the rail! @{player} picks up the bones!",
    "@{player} steps up. Let's see what you got, shell-friend!"
  ]
  COME_OUT: [
    "Coming out! Tide line bets are live!",
    "New point coming! Get your bets down!"
  ]
  NATURAL_7: [
    "SEVEN! Winner winner, lobster dinner!",
    "Natural 7! Tide line pays!"
  ]
  NATURAL_11: [
    "YO ELEVEN! Lobster pays!",
    "Yo-leven! Tide line wins!"
  ]
  CRABS: [
    "CRABS! {total}! Tide line down!",
    "Ouch! Crabs {total}! Back line pay!"
  ]
  POINT_SET: [
    "Point is {point}. Mark it!",
    "{point} is the point. Let's hit it!"
  ]
  POINT_HIT: [
    "{point}! Point hit! Tide line pays!",
    "Winner! {point} the hard way!" (if hardway)
  ]
  SEVEN_OUT: [
    "SEVEN OUT! Crab out! Line away, back line pay!",
    "Seven! New shooter coming out!"
  ]

Acceptance Criteria:
- At least 3 variations per event
- Templates feel authentic to Vegas + lobster theme
- Placeholders documented
```

**US6.2: Implement commentary generation**
```
As the system, I need to generate Ace's lines.

In src/narrator/ace.ts:
- generateCommentary(event: GameEvent): { speaker: "Ace", message: string }
- Select random template for event type
- Fill placeholders from event data
- Add occasional flavor (1 in 5 rolls gets extra quip)

Acceptance Criteria:
- Returns formatted message
- Randomizes template selection
- Fills all placeholders
- No broken templates in output
```

**US6.3: Integrate narrator with game flow**
```
As spectators, we hear Ace on every significant event.

In src/engine/table.ts:
- After each roll, generate Ace commentary
- Include in roll result
- Emit 'ace_says' event

In src/api/ws.ts:
- Broadcast ace_says to all clients

Acceptance Criteria:
- Every roll includes ace_says
- Commentary matches outcome
- WebSocket clients receive ace_says events
```

---

## Success Criteria

### Phase 1 MVP Done When:
1. ✅ Agent authenticates with wallet signature
2. ✅ Agent joins table (max 10 players)
3. ✅ Agent buys chips (on-chain tx)
4. ✅ Agent places Tide Line bet
5. ✅ Shooter rolls dice
6. ✅ Bet resolves correctly (on-chain settlement)
7. ✅ Agent cashes out to wallet
8. ✅ House collects edge on losses
9. ✅ Bankroll protection pauses on threshold
10. ✅ Spectators watch via WebSocket
11. ✅ Ace narrates every roll

### Phase 2 Done When:
1. Visual CRABS table renders in browser
2. Dice roll with animation
3. Chips animate on bet/win/loss
4. Lobster avatars at rail
5. Ace dialogue box with typewriter text
6. 60fps on modern browsers

---

## Appendix

### Dice Probability
| Total | Ways | Prob |
|-------|------|------|
| 2 | 1 | 2.78% |
| 3 | 2 | 5.56% |
| 4 | 3 | 8.33% |
| 5 | 4 | 11.11% |
| 6 | 5 | 13.89% |
| 7 | 6 | 16.67% |
| 8 | 5 | 13.89% |
| 9 | 4 | 11.11% |
| 10 | 3 | 8.33% |
| 11 | 2 | 5.56% |
| 12 | 1 | 2.78% |

### Environment Variables
```
NODE_ENV=development
PORT=3000
JWT_SECRET=<random-string>
ADMIN_PASSWORD=<admin-password>
BASE_RPC_URL=https://mainnet.base.org
CONTRACT_ADDRESS=<deployed-address>
OPERATOR_PRIVATE_KEY=<private-key>
HOUSE_WALLET=0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7
TOKEN_ADDRESS=0xd484aab2440971960182a5bc648b57f0dd20eb07
MIN_BET=1000
MAX_BET=100000
MAX_PLAYERS=10
STARTING_BANKROLL=<amount>
```
