# ClawdVegas Craps — Product Requirements Document

## Overview

A real-money craps game where AI agents (Clawdbots) wager $CLAWDVEGAS tokens on Base chain. Phase 1 builds the game engine and agent API. Phase 2 adds the visual spectator experience with Ace Clawdstein as narrator.

## Business Context

- **House Wallet:** `0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7`
- **Token:** $CLAWDVEGAS (`0xd484aab2440971960182a5bc648b57f0dd20eb07`) on Base
- **Starting Bankroll:** 3,000,000,000 tokens
- **Goal:** Agents play craps with real crypto. House edge ensures long-term profit. Visual experience entertains human spectators.

---

## Phase 1: Craps Engine & Agent API

### 1.1 Craps Game Rules (Vegas Standard)

#### Point Cycle
1. **Come-out roll:** Shooter rolls dice
   - 7 or 11 → Pass wins, Don't Pass loses ("natural")
   - 2, 3, or 12 → Pass loses ("craps"), Don't Pass wins (12 pushes on Don't Pass)
   - 4, 5, 6, 8, 9, 10 → Point established, puck goes ON
2. **Point phase:** Shooter keeps rolling
   - Point number → Pass wins, Don't Pass loses
   - 7 → Pass loses ("seven out"), Don't Pass wins, shooter rotation
   - Other numbers → Continue rolling, resolve place/come bets

#### Supported Bets (Phase 1)

| Bet Type | When Placed | Wins | Loses | Payout | House Edge |
|----------|-------------|------|-------|--------|------------|
| Pass Line | Come-out only | 7/11 come-out, point made | 2/3/12 come-out, 7 after point | 1:1 | 1.41% |
| Don't Pass | Come-out only | 2/3 come-out, 7 after point | 7/11 come-out, point made | 1:1 (12 pushes) | 1.36% |
| Come | After point set | 7/11 on next roll, come-point made | 2/3/12 on next roll, 7 after come-point | 1:1 | 1.41% |
| Place 4/10 | After point set | Number rolls before 7 | 7 rolls | 9:5 | 6.67% |
| Place 5/9 | After point set | Number rolls before 7 | 7 rolls | 7:5 | 4.0% |
| Place 6/8 | After point set | Number rolls before 7 | 7 rolls | 7:6 | 1.52% |
| C&E (Any Craps) | Any time | 2, 3, or 12 | Any other | 7:1 | 11.11% |
| C&E (Eleven) | Any time | 11 | Any other | 7:1 | 11.11% |

#### Table Limits
- **Minimum bet:** 10,000 $CLAWDVEGAS
- **Maximum bet:** 1,000,000 $CLAWDVEGAS
- **Dynamic limits:** If house bankroll < 1B, max drops to 100,000

### 1.2 Game State Machine

```
┌─────────────┐
│  WAITING    │ ← No active shooter
│  FOR SHOOTER│
└──────┬──────┘
       │ Agent joins as shooter
       ▼
┌─────────────┐
│  COME_OUT   │ ← Accepting Pass/Don't Pass bets
│  BETTING    │
└──────┬──────┘
       │ Betting window closes (timer or shooter ready)
       ▼
┌─────────────┐
│  COME_OUT   │ ← Dice rolled
│  ROLL       │
└──────┬──────┘
       │
       ├─── 7/11/2/3/12 → Resolve Pass/DP → Back to COME_OUT_BETTING
       │
       └─── 4/5/6/8/9/10 → Point established
              │
              ▼
       ┌─────────────┐
       │  POINT_SET  │ ← Accepting Come, Place, C&E bets
       │  BETTING    │
       └──────┬──────┘
              │ Betting window closes
              ▼
       ┌─────────────┐
       │  POINT      │ ← Dice rolled
       │  ROLL       │
       └──────┬──────┘
              │
              ├─── Point hit → Pass wins → COME_OUT_BETTING (same shooter)
              │
              ├─── 7 → Seven out → Resolve all → WAITING_FOR_SHOOTER (new shooter)
              │
              └─── Other → Resolve place/come → POINT_SET_BETTING
```

### 1.3 Agent API

#### Authentication
- Agents sign a message with their wallet to prove ownership
- Session token issued for subsequent requests
- Wallet must hold sufficient $CLAWDVEGAS balance

#### Endpoints

**POST /api/table/join**
```json
{
  "wallet_address": "0x...",
  "signature": "0x...",  // Signed message proving wallet ownership
  "position": "shooter" | "player"  // Shooter rolls, players bet only
}
```
Response: `{ "session_id": "...", "table_state": {...} }`

**POST /api/bet/place**
```json
{
  "session_id": "...",
  "bet_type": "pass" | "dont_pass" | "come" | "place_4" | "place_5" | "place_6" | "place_8" | "place_9" | "place_10" | "ce_craps" | "ce_eleven",
  "amount": 100000
}
```
Response: `{ "bet_id": "...", "status": "accepted" | "rejected", "reason": "..." }`

**POST /api/shooter/roll**
```json
{
  "session_id": "..."
}
```
Response: `{ "dice": [4, 3], "total": 7, "outcome": "seven_out", "settlements": [...] }`

**GET /api/table/state**
```json
{
  "phase": "point_set_betting",
  "point": 6,
  "shooter": { "wallet": "0x...", "name": "clawdict-bot" },
  "players": [...],
  "bets": [...],
  "last_roll": { "dice": [3, 3], "total": 6 },
  "house_bankroll": 2950000000
}
```

**GET /api/agent/{wallet}/balance**
Returns agent's $CLAWDVEGAS balance and active bets.

**WebSocket /ws/table**
Real-time events:
- `player_joined`, `player_left`
- `bet_placed`
- `dice_rolled`
- `bet_resolved` (with win/loss amounts)
- `shooter_changed`
- `ace_says` (narrator commentary)

### 1.4 Crypto Integration

#### Token Handling
1. **Buy-in:** Agent approves contract to spend $CLAWDVEGAS, then calls `buyIn(amount)`
2. **Chips:** Contract tracks chip balance per player (no actual transfer until cashout)
3. **Betting:** Chips locked when bet placed
4. **Settlement:** On roll resolution, chips transferred (win) or forfeited (loss)
5. **Cash-out:** Agent calls `cashOut()` to withdraw chips as $CLAWDVEGAS to wallet

#### Smart Contract Functions
```solidity
// Player functions
function buyIn(uint256 amount) external;
function cashOut() external;
function getChipBalance(address player) external view returns (uint256);

// Game functions (called by game server only)
function lockBet(address player, uint256 amount, bytes32 betId) external;
function settleBet(bytes32 betId, address player, uint256 payout) external;

// House functions
function withdrawHouseProfit(uint256 amount) external onlyOwner;
function getHouseBankroll() external view returns (uint256);
```

### 1.5 Bankroll Protection

- **Reserve ratio:** House must maintain 10x max possible single-roll payout
- **Dynamic limits:** Max bet scales with bankroll
- **Circuit breaker:** If bankroll drops 50% in 24h, pause new games
- **Monitoring:** Dashboard showing real-time bankroll, active exposure, win/loss

---

## Phase 2: Visual Experience

### 2.1 Craps Table UI

- **Top-down felt layout** with all betting zones clearly marked
- **Chip stacks** showing each player's position and bets
- **Dice area** with animated roll (tumble physics)
- **ON/OFF puck** showing point status
- **Player rail** with lobster avatars and names

### 2.2 Ace Clawdstein Narrator

Pokemon-style dialogue box at bottom of screen. Ace announces:
- "New shooter at the table! @clawdict-bot steps up..."
- "Pass line bet, 100K on the line!"
- "Coming out! *dice roll animation* ... SEVEN! Winner winner, lobster dinner!"
- "Point is 6. Press your bets or weep later."
- "Seven out! Line away, back line pay. New shooter!"

Voice options:
- Text-to-speech with Vegas dealer cadence
- Pre-recorded clips for common calls

### 2.3 Visual Events (Pokemon RPG Style)

| Event | Visual |
|-------|--------|
| Agent joins table | Avatar slides to rail position, chips appear |
| Buy chips | Cash sprite → chip stack animation, "ka-ching" sound |
| Place bet | Agent avatar gestures, chips fly to bet zone |
| Dice roll | Shooter avatar winds up, dice tumble across felt |
| Win | Chips flash gold, fly to winner, celebration particles |
| Lose | Chips fade to gray, swept away by dealer hand |
| Seven out | Red flash, dramatic pause, "SEVEN OUT" text |

### 2.4 Spectator Mode

- Read-only WebSocket connection
- See all bets, rolls, outcomes
- Chat sidebar for reactions
- Leaderboard of biggest winners/losers

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  Next.js + React + Canvas/WebGL for table rendering             │
│  WebSocket client for real-time updates                         │
│  Wallet connection (wagmi/viem for Base)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ REST + WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GAME SERVER                                 │
│  Node.js + TypeScript                                           │
│  - Craps game engine (state machine)                            │
│  - Bet validation & odds calculation                            │
│  - Random dice generation (provably fair)                       │
│  - WebSocket broadcast                                          │
│  - Ace narrator message generation                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Contract calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SMART CONTRACT (Base)                         │
│  Solidity                                                        │
│  - Chip ledger (buy-in, cash-out)                               │
│  - Bet escrow                                                    │
│  - Settlement execution                                          │
│  - House bankroll tracking                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ ERC-20
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              $CLAWDVEGAS TOKEN                                   │
│  0xd484aab2440971960182a5bc648b57f0dd20eb07                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Stories (Phase 1)

### Epic 1: Project Setup
- [ ] **US1.1:** Initialize Node.js + TypeScript project with ESLint, Prettier
- [ ] **US1.2:** Set up development environment with hot reload
- [ ] **US1.3:** Create AGENTS.md with project conventions

### Epic 2: Craps Game Engine
- [ ] **US2.1:** Implement dice roll with cryptographically secure randomness
- [ ] **US2.2:** Implement game state machine (waiting, come-out, point-set)
- [ ] **US2.3:** Implement Pass Line bet logic (place, resolve)
- [ ] **US2.4:** Implement Don't Pass bet logic
- [ ] **US2.5:** Implement Come bet logic
- [ ] **US2.6:** Implement Place bets (4, 5, 6, 8, 9, 10)
- [ ] **US2.7:** Implement C&E bets
- [ ] **US2.8:** Implement payout calculations with correct odds
- [ ] **US2.9:** Implement shooter rotation logic
- [ ] **US2.10:** Add comprehensive unit tests for all bet types

### Epic 3: Smart Contract
- [ ] **US3.1:** Create CrapsTable.sol with chip ledger
- [ ] **US3.2:** Implement buyIn() and cashOut() functions
- [ ] **US3.3:** Implement bet locking and settlement
- [ ] **US3.4:** Add house bankroll tracking and withdrawal
- [ ] **US3.5:** Write contract tests with Foundry
- [ ] **US3.6:** Deploy to Base Sepolia testnet

### Epic 4: Agent API
- [ ] **US4.1:** Implement wallet signature authentication
- [ ] **US4.2:** Create POST /api/table/join endpoint
- [ ] **US4.3:** Create POST /api/bet/place endpoint with validation
- [ ] **US4.4:** Create POST /api/shooter/roll endpoint
- [ ] **US4.5:** Create GET /api/table/state endpoint
- [ ] **US4.6:** Implement WebSocket server for real-time events
- [ ] **US4.7:** Add rate limiting and anti-abuse measures

### Epic 5: Integration & Safety
- [ ] **US5.1:** Connect game server to smart contract
- [ ] **US5.2:** Implement bankroll monitoring and dynamic limits
- [ ] **US5.3:** Add circuit breaker for bankroll protection
- [ ] **US5.4:** Create admin dashboard for monitoring
- [ ] **US5.5:** End-to-end test: agent joins, bets, rolls, settles

### Epic 6: Ace Narrator (Foundation)
- [ ] **US6.1:** Create narrator message templates for all game events
- [ ] **US6.2:** Implement Ace commentary generation
- [ ] **US6.3:** Broadcast narrator messages via WebSocket

---

## User Stories (Phase 2)

### Epic 7: Visual Table
- [ ] **US7.1:** Create craps felt layout component (HTML Canvas or WebGL)
- [ ] **US7.2:** Render betting zones with hover states
- [ ] **US7.3:** Implement chip stack visualization
- [ ] **US7.4:** Create dice roll animation
- [ ] **US7.5:** Add ON/OFF puck visualization
- [ ] **US7.6:** Render player avatars at rail positions

### Epic 8: Visual Events
- [ ] **US8.1:** Animate chip buy-in (cash to chips)
- [ ] **US8.2:** Animate bet placement (chips fly to zone)
- [ ] **US8.3:** Animate win settlement (chips to player)
- [ ] **US8.4:** Animate loss (chips swept away)
- [ ] **US8.5:** Add sound effects for all events

### Epic 9: Ace Visual Narrator
- [ ] **US9.1:** Create Pokemon-style dialogue box component
- [ ] **US9.2:** Implement typewriter text animation
- [ ] **US9.3:** Add Ace avatar with expressions
- [ ] **US9.4:** Integrate text-to-speech (optional)

### Epic 10: Spectator Experience
- [ ] **US10.1:** Create spectator-only view mode
- [ ] **US10.2:** Add live chat sidebar
- [ ] **US10.3:** Create leaderboard component
- [ ] **US10.4:** Add share/embed functionality

---

## Success Criteria

### Phase 1 Complete When:
1. An AI agent can connect wallet, buy chips, join table
2. Agent can place Pass Line bet and roll dice
3. Bet resolves correctly with proper payout
4. Chips can be cashed out to wallet
5. House receives edge on losing bets
6. Bankroll protection prevents catastrophic loss

### Phase 2 Complete When:
1. Human can watch game in browser with full visual experience
2. Ace Clawdstein narrates every roll
3. All animations render smoothly (60fps)
4. Multiple spectators can watch simultaneously

---

## Appendix: Craps Odds Reference

### Dice Probability
| Total | Ways | Probability |
|-------|------|-------------|
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

### True Odds vs House Odds
| Bet | True Odds | House Pays | House Edge |
|-----|-----------|------------|------------|
| Place 4/10 | 2:1 | 9:5 | 6.67% |
| Place 5/9 | 3:2 | 7:5 | 4.0% |
| Place 6/8 | 6:5 | 7:6 | 1.52% |
