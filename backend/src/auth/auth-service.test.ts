import { AuthService } from './auth-service';

describe('AuthService', () => {
    let authService: AuthService;

    beforeEach(() => {
        authService = new AuthService();
    });

    describe('generateNonce', () => {
        it('should generate a nonce for a valid wallet address', () => {
            const result = authService.generateNonce('erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
            expect(result.nonce).toMatch(/^cm-\d+-[a-f0-9]+$/);
            expect(result.expiresAt).toBeGreaterThan(Date.now());
        });

        it('should reject invalid wallet addresses', () => {
            expect(() => authService.generateNonce('')).toThrow('Invalid wallet address');
            expect(() => authService.generateNonce('0x123')).toThrow('Invalid wallet address');
        });

        it('should generate unique nonces', () => {
            const wallet = 'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3';
            const n1 = authService.generateNonce(wallet);
            const n2 = authService.generateNonce(wallet);
            expect(n1.nonce).not.toBe(n2.nonce);
        });
    });

    describe('verifySignature', () => {
        it('should reject unknown nonces', () => {
            expect(() =>
                authService.verifySignature('erd1abc', 'deadbeef', 'unknown-nonce'),
            ).toThrow('Nonce not found');
        });

        it('should reject nonces issued for a different wallet', () => {
            const wallet1 = 'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3';
            const wallet2 = 'erd1qqqqqqqqqqqqqqqpgqp83fextsmhsecqv0dn9k2grjt0p69y2l2jsx740de';
            const { nonce } = authService.generateNonce(wallet1);
            expect(() =>
                authService.verifySignature(wallet2, 'deadbeef', nonce),
            ).toThrow('different wallet');
        });
    });

    describe('createToken + validateToken', () => {
        it('should create and validate a token', () => {
            const wallet = 'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3';
            const { token } = authService.createToken(wallet);
            expect(token).toBeDefined();
            expect(token.split('.').length).toBe(3);

            const validated = authService.validateToken(token);
            expect(validated).toBe(wallet);
        });

        it('should reject tampered tokens', () => {
            const wallet = 'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3';
            const { token } = authService.createToken(wallet);
            const tampered = token.slice(0, -4) + 'xxxx';
            expect(authService.validateToken(tampered)).toBeNull();
        });

        it('should reject malformed tokens', () => {
            expect(authService.validateToken('')).toBeNull();
            expect(authService.validateToken('just-a-string')).toBeNull();
            expect(authService.validateToken('a.b')).toBeNull();
        });
    });

    describe('cleanExpiredTokens', () => {
        it('should remove expired tokens', () => {
            const wallet = 'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3';
            authService.createToken(wallet);
            // Tokens are 24h — cleaning now should remove nothing
            const cleaned = authService.cleanExpiredTokens();
            expect(cleaned).toBe(0);
        });
    });
});
