/**
 * Auth Middleware — Extracts wallet address from requests.
 *
 * Two auth paths:
 *   1. X-Wallet-Address header (trusted — from sdk-dapp frontend)
 *   2. Authorization: Bearer <token> (A2A — from verified nonce challenge)
 *
 * Anonymous requests are allowed but get no persistent user data.
 */
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../auth/auth-service';
import { UserStore } from '../user/user-store';

// Extend Express Request to include wallet address
declare global {
    namespace Express {
        interface Request {
            walletAddress?: string;
        }
    }
}

export function createAuthMiddleware(authService: AuthService, userStore: UserStore) {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        let walletAddress: string | undefined;

        // Path 1: X-Wallet-Address header (sdk-dapp frontend)
        const headerWallet = req.headers['x-wallet-address'] as string | undefined;
        if (headerWallet && headerWallet.startsWith('erd1')) {
            walletAddress = headerWallet;
        }

        // Path 2: Authorization: Bearer <token> (A2A)
        if (!walletAddress) {
            const authHeader = req.headers['authorization'] as string | undefined;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.slice(7);
                const verified = authService.validateToken(token);
                if (verified) {
                    walletAddress = verified;
                }
            }
        }

        // Path 3: walletAddress in request body (fallback)
        if (!walletAddress && req.body && typeof req.body.walletAddress === 'string') {
            const bodyWallet = req.body.walletAddress as string;
            if (bodyWallet.startsWith('erd1')) {
                walletAddress = bodyWallet;
            }
        }

        // Attach wallet address to request
        req.walletAddress = walletAddress;

        // Auto-create user on first interaction (non-blocking)
        if (walletAddress) {
            try {
                userStore.getOrCreateUser(walletAddress);
            } catch {
                // Don't fail the request if user creation fails
            }
        }

        next();
    };
}
