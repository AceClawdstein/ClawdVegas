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
import { type Request, type Response, type NextFunction } from 'express';
/**
 * Generate a challenge for a wallet to sign
 */
export declare function generateChallenge(wallet: string): {
    nonce: string;
    message: string;
    expires: number;
};
/**
 * Verify a signed challenge and issue JWT
 */
export declare function verifyChallenge(wallet: string, signature: `0x${string}`, nonce: string, message: string): Promise<{
    success: true;
    token: string;
    expiresAt: number;
} | {
    success: false;
    error: string;
}>;
/**
 * Verify a JWT token
 */
export declare function verifyToken(token: string): {
    valid: true;
    wallet: string;
} | {
    valid: false;
    error: string;
};
/**
 * Express middleware to require authentication
 * Sets req.wallet if valid, returns 401 if not
 */
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
/**
 * Optional auth - doesn't fail if no token, but sets wallet if present
 */
export declare function optionalAuth(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map