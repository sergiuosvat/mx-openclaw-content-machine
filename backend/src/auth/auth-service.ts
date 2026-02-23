/**
 * AuthService — Dual-path authentication for The Content Machine.
 *
 * Path 1 (Frontend / sdk-dapp): X-Wallet-Address header — trusted.
 * Path 2 (Agent-to-Agent):      Sign-a-nonce challenge — cryptographic proof.
 *
 * The A2A flow:
 *   1. POST /api/auth/nonce   → { nonce, expiresAt }
 *   2. Agent signs the nonce with its private key
 *   3. POST /api/auth/verify  → { token, walletAddress }
 *   4. Use token as Bearer token in Authorization header
 */
import crypto from 'crypto';
import { UserVerifier } from '@multiversx/sdk-wallet';
import { Address } from '@multiversx/sdk-core';

// ─── Types ────────────────────────────────────────────────────────────────

interface NonceRecord {
    nonce: string;
    walletAddress: string;
    createdAt: number;
    expiresAt: number;
}

interface TokenPayload {
    walletAddress: string;
    issuedAt: number;
    expiresAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

const NONCE_TTL_MS = 5 * 60 * 1000;        // 5 minutes
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

// ─── Service ──────────────────────────────────────────────────────────────

export class AuthService {
    private nonces: Map<string, NonceRecord> = new Map();
    private tokens: Map<string, TokenPayload> = new Map();

    /**
     * Generate a nonce for the A2A sign-a-nonce challenge.
     */
    generateNonce(walletAddress: string): { nonce: string; expiresAt: number } {
        if (!walletAddress || !walletAddress.startsWith('erd1')) {
            throw new Error('Invalid wallet address: must start with erd1');
        }

        const nonce = `cm-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
        const now = Date.now();
        const expiresAt = now + NONCE_TTL_MS;

        this.nonces.set(nonce, {
            nonce,
            walletAddress,
            createdAt: now,
            expiresAt,
        });

        // Cleanup expired nonces
        this.cleanExpiredNonces();

        return { nonce, expiresAt };
    }

    /**
     * Verify a signed nonce and issue a bearer token.
     *
     * Uses MultiversX UserVerifier to check the signature against the
     * wallet's public key derived from the bech32 address.
     */
    verifySignature(
        walletAddress: string,
        signature: string,
        nonce: string,
    ): { token: string; walletAddress: string; expiresAt: number } {
        // 1. Check nonce exists and matches wallet
        const record = this.nonces.get(nonce);
        if (!record) {
            throw new Error('Nonce not found or expired');
        }
        if (record.walletAddress !== walletAddress) {
            throw new Error('Nonce was issued for a different wallet');
        }
        if (Date.now() > record.expiresAt) {
            this.nonces.delete(nonce);
            throw new Error('Nonce expired');
        }

        // 2. Verify signature using MultiversX SDK
        try {
            const address = Address.newFromBech32(walletAddress);
            const verifier = UserVerifier.fromAddress(address as unknown as { pubkey(): Buffer });

            const message = Buffer.from(nonce);
            const sig = Buffer.from(signature, 'hex');

            const isValid = verifier.verify(message, sig);
            if (!isValid) {
                throw new Error('Invalid signature');
            }
        } catch (err) {
            if ((err as Error).message === 'Invalid signature') throw err;
            throw new Error(`Signature verification failed: ${(err as Error).message}`);
        }

        // 3. Consume nonce (one-time use)
        this.nonces.delete(nonce);

        // 4. Issue bearer token
        const token = this.createToken(walletAddress);
        return token;
    }

    /**
     * Create a bearer token for a verified wallet.
     */
    createToken(walletAddress: string): { token: string; walletAddress: string; expiresAt: number } {
        const now = Date.now();
        const expiresAt = now + TOKEN_TTL_MS;

        // HMAC-based token: walletAddress.issuedAt.hmac
        const payload = `${walletAddress}.${now}`;
        const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
        const token = `${payload}.${hmac}`;

        this.tokens.set(token, {
            walletAddress,
            issuedAt: now,
            expiresAt,
        });

        return { token, walletAddress, expiresAt };
    }

    /**
     * Validate a bearer token and return the wallet address.
     */
    validateToken(token: string): string | null {
        // Check in-memory cache first
        const cached = this.tokens.get(token);
        if (cached) {
            if (Date.now() > cached.expiresAt) {
                this.tokens.delete(token);
                return null;
            }
            return cached.walletAddress;
        }

        // Verify HMAC integrity
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [walletAddress, issuedAtStr, providedHmac] = parts;
        const issuedAt = parseInt(issuedAtStr, 10);
        if (isNaN(issuedAt)) return null;

        // Check expiry
        if (Date.now() > issuedAt + TOKEN_TTL_MS) return null;

        // Verify HMAC
        const payload = `${walletAddress}.${issuedAtStr}`;
        const expectedHmac = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
        if (providedHmac !== expectedHmac) return null;

        // Cache for subsequent lookups
        this.tokens.set(token, {
            walletAddress,
            issuedAt,
            expiresAt: issuedAt + TOKEN_TTL_MS,
        });

        return walletAddress;
    }

    /**
     * Remove expired nonces.
     */
    private cleanExpiredNonces(): void {
        const now = Date.now();
        for (const [key, record] of this.nonces) {
            if (now > record.expiresAt) {
                this.nonces.delete(key);
            }
        }
    }

    /**
     * Remove expired tokens (call periodically via cron).
     */
    cleanExpiredTokens(): number {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, payload] of this.tokens) {
            if (now > payload.expiresAt) {
                this.tokens.delete(key);
                cleaned++;
            }
        }
        return cleaned;
    }
}
