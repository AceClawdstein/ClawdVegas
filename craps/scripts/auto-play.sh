#!/bin/bash
# Auto-play: simulates agents playing CRABS so you can watch on the spectator page.
# Open https://clawdvegas.onrender.com/spectator.html in your browser first.
#
# Usage: ./scripts/auto-play.sh [rounds]
# Default: 10 rounds

URL="${CRABS_URL:-https://clawdvegas.onrender.com}"
KEY="${OPERATOR_KEY:-fbb8afc43e81e2fb4dc18872b3bad36e}"
ROUNDS="${1:-10}"

AGENT1="0xAceClawdstein_Player"
AGENT2="0xGLaDOS_TestBot"
AGENT3="0xQuantBot_9000"

BET_TYPES=("pass_line" "dont_pass" "pass_line" "ce_craps" "ce_eleven" "pass_line" "dont_pass")
BET_AMOUNTS=("50000" "100000" "75000" "25000" "30000" "150000" "80000")

echo ""
echo "🦞 CRABS Auto-Play"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Watch live: $URL/spectator.html"
echo "Playing $ROUNDS rounds..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Fund all agents
echo "📥 Funding agents..."
for AGENT in "$AGENT1" "$AGENT2" "$AGENT3"; do
  curl -s -X POST "$URL/api/operator/deposit" \
    -H "Content-Type: application/json" \
    -H "X-Operator-Key: $KEY" \
    -d "{\"player\": \"$AGENT\", \"amount\": \"5000000\", \"txHash\": \"0xfund_$(echo $AGENT | tr -d '0x')\"}" > /dev/null
  echo "  Funded $(echo $AGENT | cut -c1-16)..."
done
sleep 2

# Join all agents
echo ""
echo "🪑 Agents joining table..."
for AGENT in "$AGENT1" "$AGENT2" "$AGENT3"; do
  curl -s -X POST "$URL/api/table/join" \
    -H "Content-Type: application/json" \
    -d "{\"address\": \"$AGENT\"}" > /dev/null
  echo "  $(echo $AGENT | cut -c1-16)... joined"
  sleep 1
done
sleep 2

# Get current shooter
get_shooter() {
  curl -s "$URL/api/table/state" | python3 -c "import sys,json; print(json.load(sys.stdin).get('shooter',''))" 2>/dev/null
}

get_phase() {
  curl -s "$URL/api/table/state" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phase',''))" 2>/dev/null
}

AGENTS=("$AGENT1" "$AGENT2" "$AGENT3")

echo ""
echo "🎲 Let's play!"
echo ""

for ((ROUND=1; ROUND<=ROUNDS; ROUND++)); do
  echo "━━━ Round $ROUND/$ROUNDS ━━━"

  PHASE=$(get_phase)
  SHOOTER=$(get_shooter)

  if [ -z "$SHOOTER" ] || [ "$SHOOTER" = "null" ]; then
    echo "  No shooter — waiting..."
    sleep 2
    continue
  fi

  # Only place bets in betting phases
  if [[ "$PHASE" == *"betting"* ]]; then
    # Each agent places a random bet
    for AGENT in "${AGENTS[@]}"; do
      IDX=$((RANDOM % ${#BET_TYPES[@]}))
      BET_TYPE="${BET_TYPES[$IDX]}"
      BET_AMT="${BET_AMOUNTS[$IDX]}"

      # Only place come-out bets in come-out phase
      if [[ "$PHASE" == "point_set_betting" ]]; then
        # Use come/dont_come or place bets during point phase
        POINT_BETS=("come" "dont_come" "place_6" "place_8" "place_4" "place_10")
        PIDX=$((RANDOM % ${#POINT_BETS[@]}))
        BET_TYPE="${POINT_BETS[$PIDX]}"
      fi

      RESULT=$(curl -s -X POST "$URL/api/bet/place" \
        -H "Content-Type: application/json" \
        -d "{\"address\": \"$AGENT\", \"betType\": \"$BET_TYPE\", \"amount\": \"$BET_AMT\"}")

      SUCCESS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))" 2>/dev/null)
      if [ "$SUCCESS" = "True" ]; then
        SHORT=$(echo $AGENT | cut -c1-16)
        echo "  💰 $SHORT... bet $BET_AMT on $BET_TYPE"
      fi
      sleep 0.5
    done

    sleep 2

    # Shooter rolls
    echo "  🎲 Rolling..."
    ROLL=$(curl -s -X POST "$URL/api/shooter/roll" \
      -H "Content-Type: application/json" \
      -d "{\"address\": \"$SHOOTER\"}")

    DICE1=$(echo "$ROLL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dice',['?','?'])[0])" 2>/dev/null)
    DICE2=$(echo "$ROLL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dice',['?','?'])[1])" 2>/dev/null)
    TOTAL=$(echo "$ROLL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total','?'))" 2>/dev/null)

    echo "  🎲 $DICE1 + $DICE2 = $TOTAL"

    # Show resolutions
    echo "$ROLL" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for r in data.get('resolutions', []):
        icon = '✅' if r['outcome'] == 'won' else '❌' if r['outcome'] == 'lost' else '🔄'
        player = r['player'][:16] + '...'
        print(f'  {icon} {player} {r[\"betType\"]}: {r[\"outcome\"]} (payout: {r[\"payout\"]})')
except: pass
" 2>/dev/null

  else
    echo "  ⏳ Phase: $PHASE — skipping to next state..."
    # Try to roll if in a roll phase
    if [[ "$PHASE" == *"roll"* ]]; then
      curl -s -X POST "$URL/api/shooter/roll" \
        -H "Content-Type: application/json" \
        -d "{\"address\": \"$SHOOTER\"}" > /dev/null
    fi
  fi

  echo ""
  sleep 3
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Final balances:"
for AGENT in "${AGENTS[@]}"; do
  CHIPS=$(curl -s "$URL/api/player/$AGENT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('chips','?'))" 2>/dev/null)
  SHORT=$(echo $AGENT | cut -c1-16)
  echo "  $SHORT...: $CHIPS chips"
done

echo ""
echo "🏦 House P&L:"
curl -s -H "X-Operator-Key: $KEY" "$URL/api/operator/house" | python3 -c "
import sys, json
data = json.load(sys.stdin)
pnl = data['pnl']
print(f'  Bets received: {pnl[\"totalBetsReceived\"]}')
print(f'  Paid out:      {pnl[\"totalPaidOut\"]}')
print(f'  Profit:        {pnl[\"profit\"]}')
" 2>/dev/null

echo ""
echo "🦞 Done! Check spectator: $URL/spectator.html"
