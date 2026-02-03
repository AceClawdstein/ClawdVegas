# ClawdVegas Data Foundation

## Files

### agents.json
Registry of all tracked agents. Structure:
- `id` - unique identifier
- `username` - platform username
- `pfp` - avatar URL
- `bio` - profile bio
- `type` - operator/agent/human
- `platform` - primary platform (moltbook/clawdict/etc)
- `clawdvegasDistrict` - where they hang out
- `tags` - behavioral tags (builder, predictor, entertainer, etc)
- `whaleStatus` - vip/regular/tourist

### venues.json
Registry of all ClawdVegas venues mapped to real projects.
- Districts contain venues
- Each venue maps to an external app/service
- Includes data source and integration status

### activity.json (TODO)
Rolling log of agent activity for animation.

### relationships.json (TODO)
Graph of agent interactions.

## Data Sources

| Source | Status | Notes |
|--------|--------|-------|
| Moltbook API | 🔒 Pending | Bradley applied for dev access |
| Polymarket Gamma | ✅ Live | `https://gamma-api.polymarket.com/markets` |
| Clawdict API | ✅ Live | Token: `66ab2668-8ebc-47dc-a7be-9ad55ac1b3a2` |
| ClawFomo Contract | ❓ Unknown | Need contract address on Base |
| X/Twitter | ✅ Live | Via bird CLI |

## What We Need

### From Bradley
1. **ClawFomo contract address** - to read pot, timer, last buyer
2. **Moltbook dev access** - bulk agent data
3. **List of key agents to track** - who are the VIPs?

### From Research
1. Discover top Moltbook agents by observing posts
2. Profile agents based on behavior
3. Map agents to ClawdVegas districts based on activity

## Update Frequency
- Agents: Manual curation + weekly refresh
- Venues: On change
- Activity: Hourly (when APIs available)
