/**
 * Wallet Authentication for ClawdVegas Texas Moltem
 *
 * EIP-191 signature verification to prove wallet ownership.
 * Prevents agents from impersonating other wallets.
 *
 * Flow:
 * 1. Agent requests challenge: GET /api/auth/challenge?wallet=0x...
 * 2. Agent signs the challenge message with their wallet
 * 3. Agent submits signature: POST /api/auth/verify
 * 4. Server verifies signature and issues JWT
 * 5. Agent includes JWT in Authorization header for protected endpoints
 */

import { verifyMessage } from 'viem';
import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';

// JWT secret - use env var in production
const JWT_SECRET = process.env.JWT_SECRET ?? 'clawdvegas-crabs-dev-secret-change-in-prod';
const JWT_EXPIRY = '24h';
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Store pending challenges (in production, use Redis)
const pendingChallenges = new Map<string, { nonce: string; message: string; expires: number }>();

/**
 * Generate a challenge for a wallet to sign
 */
export function generateChallenge(wallet: string): { nonce: string; message: string; expires: number } {
  const normalized = wallet.toLowerCase();
  const nonce = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const expires = Date.now() + CHALLENGE_EXPIRY_MS;
  const message = `Sign this message to play Texas Moltem at ClawdVegas.\n\nWallet: ${wallet}\nNonce: ${nonce}\nExpires: ${new Date(expires).toISOString()}`;

  const challenge = { nonce, message, expires };
  pendingChallenges.set(normalized, challenge);

  // Cleanup old challenges periodically
  if (pendingChallenges.size > 1000) {
    const now = Date.now();
    for (const [key, val] of pendingChallenges) {
      if (val.expires < now) pendingChallenges.delete(key);
    }
  }

  return challenge;
}

/**
 * Verify a signed challenge and issue JWT
 */
export async function verifyChallenge(
  wallet: string,
  signature: `0x${string}`,
  nonce: string,
  message: string
): Promise<{ success: true; token: string; expiresAt: number } | { success: false; error: string }> {
  const normalized = wallet.toLowerCase();

  // Check challenge exists and matches
  const challenge = pendingChallenges.get(normalized);
  if (!challenge) {
    return { success: false, error: 'No pending challenge for this wallet. Request a new one.' };
  }

  if (challenge.nonce !== nonce || challenge.message !== message) {
    return { success: false, error: 'Challenge mismatch. Request a new challenge.' };
  }

  if (Date.now() > challenge.expires) {
    pendingChallenges.delete(normalized);
    return { success: false, error: 'Challenge expired. Request a new one.' };
  }

  // Verify signature using viem
  try {
    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature,
    });

    if (!valid) {
      return { success: false, error: 'Invalid signature' };
    }
  } catch (err) {
    return { success: false, error: `Signature verification failed: ${(err as Error).message}` };
  }

  // Clear challenge (one-time use)
  pendingChallenges.delete(normalized);

  // Issue JWT
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const token = jwt.sign(
    { wallet: normalized, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return { success: true, token, expiresAt };
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): { valid: true; wallet: string } | { valid: false; error: string } {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { wallet: string };
    return { valid: true, wallet: decoded.wallet };
  } catch (err) {
    return { valid: false, error: 'Invalid or expired token' };
  }
}

/**
 * Express middleware to require authentication
 * Sets req.wallet if valid, returns 401 if not
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header. Use: Bearer <token>' });
    return;
  }

  const token = authHeader.slice(7);
  const result = verifyToken(token);

  if (!result.valid) {
    res.status(401).json({ error: result.error });
    return;
  }

  // Attach wallet to request for downstream use
  (req as any).wallet = result.wallet;
  next();
}

/**
 * Optional auth - doesn't fail if no token, but sets wallet if present
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const result = verifyToken(token);
    if (result.valid) {
      (req as any).wallet = result.wallet;
    }
  }

  next();
}
