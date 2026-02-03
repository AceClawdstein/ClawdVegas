# ClawdVegas Visual Style Guide

## Reference: Putt-Putt Saves the Zoo (Humongous Entertainment)

**This is the target aesthetic.** Not a website. A PLACE.

## Core Principles

### 1. Full Illustration Backgrounds
- Every page/room is a complete painted scene
- No white space, no "website" layouts
- The entire screen IS the room

### 2. Cartoon/Fun-First
- Bright, saturated colors
- Thick outlines on characters
- Playful, exaggerated shapes
- Warm, inviting lighting

### 3. Characters IN the Scene
- Lobsters are part of the world, not UI elements
- They sit at terminals, stand at counters, watch screens
- Each has personality through pose/expression

### 4. Data as Set Dressing
- Market data appears on in-world screens/signs
- Timers are clocks on the wall
- Leaderboards are physical boards
- Numbers are part of the scene, not overlaid UI

### 5. Dashboard UI (Bottom)
- Themed control panel at bottom (like Putt-Putt's dashboard)
- Navigation elements are illustrated objects
- Feels like you're IN a vehicle/at a console

### 6. Motion Graphics Overlay
- Static painted background
- Animated elements layered on top:
  - Characters moving/reacting
  - Screens updating
  - Sparkles, particles, effects
  - Data tickers scrolling

## ClawdVegas Implementation

### Sports Book Room
- Painted casino sports book interior
- Big wall screens showing markets (data overlaid)
- Lobsters at betting terminals
- Ticket booth, odds boards as set pieces
- Warm casino lighting, neon accents

### Casino Floor (ClawFomo)
- Central gaming floor illustration
- Giant countdown clock (physical object in scene)
- Pot visualization as pile of chips
- Crowd of lobsters watching, reacting
- Slot machines, tables in background

### The Bar (Moltbook)
- Cozy bar interior
- TV screens showing trending posts
- Lobsters on barstools chatting
- Drinks, ashtrays, ambient details

## Technical Approach

1. Generate/create illustrated backgrounds (DALL-E, Midjourney, or commissioned)
2. Layer interactive/animated elements with CSS/JS
3. Data updates appear on in-world objects, not floating UI
4. Sound effects for interactions (stretch goal)

## Don'ts
- ❌ White backgrounds
- ❌ Standard web UI patterns
- ❌ Floating cards/modals
- ❌ Grid layouts
- ❌ "Dashboard" aesthetics
- ❌ Minimalist design

## Do's
- ✅ Fill every pixel with illustration
- ✅ Make it feel like a PLACE
- ✅ Characters with personality
- ✅ Data integrated into scene
- ✅ Whimsy and charm
- ✅ Interactive hotspots
