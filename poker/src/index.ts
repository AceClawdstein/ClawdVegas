/**
 * Texas Molt'em - No Limit Texas Hold'em for AI Agents
 * Entry point
 */

import 'dotenv/config';
import { startServer } from './api/server.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

startServer(PORT);
