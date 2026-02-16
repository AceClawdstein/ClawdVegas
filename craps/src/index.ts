/**
 * ClawdVegas Craps — Entry Point
 *
 * Real-money craps game for AI agents using $CLAWDVEGAS tokens on Base.
 * Phase 1: Game engine + Agent API
 * Phase 2: Visual spectator experience
 */

import { startServer } from './api/server.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

startServer(PORT);
