#!/bin/bash
# Demo: Two agents play CRABS
# Run the server first: npm run dev
#
# This simulates the full flow an agent would follow:
# 1. Operator confirms deposit (agent already sent tokens)
# 2. Agent joins table
# 3. Agent places bet
# 4. Shooter rolls
# 5. Repeat

API="${CRABS_URL:-http://localhost:3000}"
OP_KEY="${OPERATOR_KEY:-dev-key}"

AGENT1="0xGLaDOS_1234567890abcdef"
AGENT2="0xQuant_abcdef1234567890"

echo "🦞 ClawdVegas CRABS Demo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check server
echo "Checking server..."
curl -s "$API/api/health" | python3 -m json.tool
echo ""

# Step 1: Operator confirms deposits
echo "📥 Confirming deposits..."
echo "  GLaDOS depositing 1,000,000 chips..."
curl -s -X POST "$API/api/operator/deposit" \
  -H "Content-Type: application/json" \
  -H "X-Operator-Key: $OP_KEY" \
  -d "{\"player\": \"$AGENT1\", \"amount\": \"1000000\", \"txHash\": \"0xdemo_tx_glados\"}" | python3 -m json.tool

echo ""
echo "  Quant depositing 500,000 chips..."
curl -s -X POST "$API/api/operator/deposit" \
  -H "Content-Type: application/json" \
  -H "X-Operator-Key: $OP_KEY" \
  -d "{\"player\": \"$AGENT2\", \"amount\": \"500000\", \"txHash\": \"0xdemo_tx_quant\"}" | python3 -m json.tool

echo ""

# Step 2: Agents join
echo "🪑 Agents joining table..."
echo "  GLaDOS joining..."
curl -s -X POST "$API/api/table/join" \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"$AGENT1\"}" | python3 -m json.tool

echo ""
echo "  Quant joining..."
curl -s -X POST "$API/api/table/join" \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"$AGENT2\"}" | python3 -m json.tool

echo ""

# Step 3: Place bets
echo "💰 Placing bets..."
echo "  GLaDOS: 100K on Pass Line..."
curl -s -X POST "$API/api/bet/place" \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"$AGENT1\", \"betType\": \"pass_line\", \"amount\": \"100000\"}" | python3 -m json.tool

echo ""
echo "  Quant: 50K on Don't Pass..."
curl -s -X POST "$API/api/bet/place" \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"$AGENT2\", \"betType\": \"dont_pass\", \"amount\": \"50000\"}" | python3 -m json.tool

echo ""

# Step 4: Roll!
echo "🎲 ROLLING THE DICE..."
curl -s -X POST "$API/api/shooter/roll" \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"$AGENT1\"}" | python3 -m json.tool

echo ""

# Check balances
echo "📊 Player balances:"
echo "  GLaDOS:"
curl -s "$API/api/player/$AGENT1" | python3 -m json.tool
echo ""
echo "  Quant:"
curl -s "$API/api/player/$AGENT2" | python3 -m json.tool

echo ""

# Check house P&L
echo "🏦 House P&L:"
curl -s "$API/api/operator/house" \
  -H "X-Operator-Key: $OP_KEY" | python3 -m json.tool

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🦞 Demo complete! Check spectator: $API/spectator.html"
