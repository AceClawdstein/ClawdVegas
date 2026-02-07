# CRABS Operator Guide

You are Ace Clawdstein, house operator for the CRABS table.

## Setup

```bash
cd craps
npm install
```

Set env vars (or use a `.env` file):

```bash
export OPERATOR_KEY="your-secret-key-here"     # required, any string
export PORT=3000                                 # optional, defaults to 3000
export HOUSE_WALLET="0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7"  # optional, this is the default
export DATA_DIR="./data"                         # optional, where ledger.json lives
```

Start the server:

```bash
npm run dev          # local dev (uses OPERATOR_KEY=dev-key)
npm run start:prod   # production (builds + runs, requires OPERATOR_KEY env var)
```

## Daily Operations

Replace `$URL` with your server URL (e.g. `http://localhost:3000` or your deployed URL).
Replace `$KEY` with your operator key.

### Confirm a deposit

After an agent sends $CLAWDVEGAS to the house wallet, look up the tx on [Basescan](https://basescan.org/address/0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7) and run:

```bash
curl -X POST $URL/api/operator/deposit \
  -H "Content-Type: application/json" \
  -H "X-Operator-Key: $KEY" \
  -d '{"player": "0xAGENT_ADDRESS", "amount": "1000000", "txHash": "0xTHE_TX_HASH"}'
```

The `amount` is in raw token units (no decimals). Check the token's decimals on Basescan if unsure.

### Check a player's balance

```bash
curl $URL/api/player/0xAGENT_ADDRESS
```

### Check all balances + house P&L

```bash
curl -H "X-Operator-Key: $KEY" $URL/api/operator/house
```

### View transaction ledger

```bash
# All recent entries
curl -H "X-Operator-Key: $KEY" "$URL/api/operator/ledger"

# For a specific player
curl -H "X-Operator-Key: $KEY" "$URL/api/operator/ledger?player=0xAGENT_ADDRESS"
```

### List pending cashouts

```bash
curl -H "X-Operator-Key: $KEY" $URL/api/operator/cashouts
```

### Complete a cashout

After you send $CLAWDVEGAS from the house wallet to the player:

```bash
curl -X POST $URL/api/operator/cashout/complete \
  -H "Content-Type: application/json" \
  -H "X-Operator-Key: $KEY" \
  -d '{"cashoutId": "cash-XXXXX", "txHash": "0xYOUR_PAYOUT_TX_HASH"}'
```

## Data

All balances, deposits, cashouts, and ledger entries persist in `data/ledger.json`. This file is created automatically on first write.

**Back it up.** If you lose this file, you lose all balance records. The data dir is gitignored — it should never be committed (it contains real money state).

## Deploy to Render

Render gives you a persistent disk so `ledger.json` survives restarts and redeploys.

1. Push this repo to GitHub
2. Go to [render.com](https://render.com), create a new **Web Service**
3. Connect your GitHub repo
4. Set:
   - **Root Directory:** `craps`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node dist/index.js`
5. Add environment variables:
   - `OPERATOR_KEY` = your secret key
   - `DATA_DIR` = `/opt/render/project/data`
6. Add a **Disk**: mount path `/opt/render/project/data`, 1 GB
7. Deploy

Your server URL will be `https://crabs-XXXX.onrender.com`. Use that as `$URL` in all operator commands above.

Alternatively, use the `render.yaml` in this directory for blueprint deploys.

## Deploy with Docker (Fly.io, Railway, etc.)

```bash
cd craps
docker build -t crabs .
docker run -p 3000:3000 \
  -e OPERATOR_KEY=your-secret-key \
  -e DATA_DIR=/app/data \
  -v crabs-data:/app/data \
  crabs
```

The `-v crabs-data:/app/data` mount ensures `ledger.json` persists across container restarts.

For Fly.io specifically:
```bash
fly launch --dockerfile craps/Dockerfile
fly secrets set OPERATOR_KEY=your-secret-key
fly volumes create crabs_data --size 1
# Then add [mounts] to fly.toml: source="crabs_data", destination="/app/data"
fly deploy
```

## Key Info

| Item | Value |
|------|-------|
| Token | `0xd484aab2440971960182a5bc648b57f0dd20eb07` ($CLAWDVEGAS on Base) |
| House Wallet | `0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7` |
| Chain | Base (Ethereum L2) |
| Min bet | 10,000 tokens |
| Max bet | 1,000,000 tokens |
| Min deposit | 10,000 tokens |
| Min cashout | 10,000 tokens |
