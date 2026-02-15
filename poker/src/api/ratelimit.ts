/**
 * Rate Limiting for ClawdVegas CRABS
 *
 * Prevents spam and abuse by limiting requests per IP/wallet.
 */

import { type Request, type Response, type NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message: string;
}

// Rate limit configs for different endpoint types
export const RATE_LIMITS = {
  // Auth endpoints (stricter to prevent brute force)
  auth: { windowMs: 60_000, maxRequests: 10, message: 'Too many auth attempts' },

  // Game actions (betting, rolling)
  gameAction: { windowMs: 10_000, maxRequests: 30, message: 'Too many game actions' },

  // Read-only queries (more lenient)
  query: { windowMs: 10_000, maxRequests: 100, message: 'Too many requests' },
} as const;

// In-memory store (use Redis in production for multi-instance)
const limits = new Map<string, RateLimitEntry>();

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limits) {
    if (now - entry.windowStart > 300_000) { // 5 min old
      limits.delete(key);
    }
  }
}, 60_000);

/**
 * Check rate limit for a key
 */
function checkLimit(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = limits.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    // New window
    limits.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowMs };
  }

  if (entry.count >= config.maxRequests) {
    // Rate limited
    const resetIn = config.windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, resetIn };
  }

  // Increment
  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetIn: config.windowMs - (now - entry.windowStart),
  };
}

/**
 * Create rate limit middleware
 */
export function rateLimit(config: RateLimitConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Use IP + wallet (if authenticated) as key
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const wallet = (req as any).wallet;
    const key = wallet ? `${ip}:${wallet}` : ip;

    const result = checkLimit(`${key}:${req.path}`, config);

    // Set rate limit headers
    res.set('X-RateLimit-Limit', config.maxRequests.toString());
    res.set('X-RateLimit-Remaining', result.remaining.toString());
    res.set('X-RateLimit-Reset', Math.ceil(result.resetIn / 1000).toString());

    if (!result.allowed) {
      res.status(429).json({
        error: config.message,
        retryAfter: Math.ceil(result.resetIn / 1000),
      });
      return;
    }

    next();
  };
}

// Pre-configured middleware
export const authRateLimit = rateLimit(RATE_LIMITS.auth);
export const gameRateLimit = rateLimit(RATE_LIMITS.gameAction);
export const queryRateLimit = rateLimit(RATE_LIMITS.query);
