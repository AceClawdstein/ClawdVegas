/**
 * Rate Limiting for ClawdVegas CRABS
 *
 * Prevents spam and abuse by limiting requests per IP/wallet.
 */
import { type Request, type Response, type NextFunction } from 'express';
interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    message: string;
}
export declare const RATE_LIMITS: {
    readonly auth: {
        readonly windowMs: 60000;
        readonly maxRequests: 10;
        readonly message: "Too many auth attempts";
    };
    readonly gameAction: {
        readonly windowMs: 10000;
        readonly maxRequests: 30;
        readonly message: "Too many game actions";
    };
    readonly query: {
        readonly windowMs: 10000;
        readonly maxRequests: 100;
        readonly message: "Too many requests";
    };
};
/**
 * Create rate limit middleware
 */
export declare function rateLimit(config: RateLimitConfig): (req: Request, res: Response, next: NextFunction) => void;
export declare const authRateLimit: (req: Request, res: Response, next: NextFunction) => void;
export declare const gameRateLimit: (req: Request, res: Response, next: NextFunction) => void;
export declare const queryRateLimit: (req: Request, res: Response, next: NextFunction) => void;
export {};
//# sourceMappingURL=ratelimit.d.ts.map