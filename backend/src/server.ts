import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { SessionStore } from './session/session-store';
import { createAgentNativeRoutes } from './routes/agent-native';
import { ContentMachineAgent } from './agent/content-machine-agent';
import { AuthService } from './auth/auth-service';
import { UserStore } from './user/user-store';
import { createAuthMiddleware } from './middleware/auth-middleware';

// [M-2 FIX] Body size limit constant
const JSON_BODY_LIMIT = '1mb';

// [L-4 FIX] Sanitize filename: strip path traversal and non-ASCII
function sanitizeFilename(filename: string): string {
    return filename
        .replace(/[^\w\s.\-]/g, '_') // Replace non-word chars except dots/hyphens
        .replace(/\.{2,}/g, '.')     // Collapse multiple dots
        .replace(/^\./, '_')         // No leading dot
        .substring(0, 200);          // Cap length
}

// Multer config for file uploads
const upload = multer({
    dest: path.resolve(__dirname, '../uploads'),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
    fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.csv', '.txt', '.docx', '.md'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${ext} not allowed. Supported: ${allowed.join(', ')}`));
        }
    },
});

// [H-1 FIX] Rate limiters
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 30,               // 30 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait before sending another message.' },
});

const paymentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,                // 5 payment confirmations per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many payment confirmation attempts. Please wait.' },
});

// [M-4 FIX] Verify transaction on-chain (stub — wire to MultiversX API in production)
async function verifyTransactionOnChain(txHash: string): Promise<{ valid: boolean; status?: string }> {
    // In test/dev mode, skip on-chain verification entirely
    if (process.env.NODE_ENV === 'test' || process.env.SKIP_TX_VERIFICATION === 'true') {
        return { valid: true, status: 'skipped_verification' };
    }

    const apiUrl = process.env.MULTIVERSX_API_URL || 'https://devnet-api.multiversx.com';
    try {
        const response = await fetch(`${apiUrl}/transactions/${txHash}`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
            return { valid: false, status: 'not_found' };
        }
        const data = await response.json() as Record<string, unknown>;
        const status = (data.status as string) || 'unknown';
        return { valid: status === 'success', status };
    } catch {
        return { valid: false, status: 'verification_failed' };
    }
}

// Load agent config
function loadAgentConfig(): Record<string, unknown> {
    try {
        return require(path.resolve(process.cwd(), 'agent.config.json'));
    } catch {
        return {
            agentName: process.env.AGENT_NAME || 'openclaw-bot',
            description: 'A MultiversX-powered AI agent',
            pricing: {
                perQuery: process.env.PRICE_PER_QUERY || '0.50',
                token: process.env.PRICE_TOKEN || 'USDC-350c4e',
            },
        };
    }
}

export function createApp(): Express {
    const app = express();
    const sessionStore = new SessionStore();
    const agentConfig = loadAgentConfig();
    const authService = new AuthService();
    const userStore = new UserStore();

    // ==========================================
    // Security Middleware
    // ==========================================

    // [M-1 FIX] Helmet — CSP, HSTS, X-Frame-Options, X-Content-Type-Options
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for SSE
            },
        },
        crossOriginEmbedderPolicy: false, // Allow embedding for landing page assets
    }));

    // [H-2 FIX] CORS — explicit origin, never wildcard in production
    const corsOrigin = process.env.CORS_ORIGIN;
    app.use(cors({
        origin: corsOrigin || (process.env.NODE_ENV === 'production' ? false : '*'),
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Wallet-Address'],
    }));

    // [M-2 FIX] Body size limit
    app.use(express.json({ limit: JSON_BODY_LIMIT }));

    // [L-3 FIX] Request logging
    if (process.env.NODE_ENV !== 'test') {
        app.use(morgan('combined'));
    }

    // ==========================================
    // Auth Middleware (extracts wallet address)
    // ==========================================
    app.use(createAuthMiddleware(authService, userStore));

    // ==========================================
    // Agent-Native Routes (parity layer)
    // ==========================================
    app.use('/api', createAgentNativeRoutes(sessionStore));

    // ==========================================
    // Auth Routes (A2A nonce challenge)
    // ==========================================
    app.post('/api/auth/nonce', (req, res) => {
        const { walletAddress } = req.body;
        if (!walletAddress || typeof walletAddress !== 'string') {
            res.status(400).json({ error: 'walletAddress is required' });
            return;
        }
        try {
            const result = authService.generateNonce(walletAddress);
            res.json(result);
        } catch (err: unknown) {
            res.status(400).json({ error: (err as Error).message });
        }
    });

    app.post('/api/auth/verify', (req, res) => {
        const { walletAddress, signature, nonce } = req.body;
        if (!walletAddress || !signature || !nonce) {
            res.status(400).json({ error: 'walletAddress, signature, and nonce are required' });
            return;
        }
        try {
            const result = authService.verifySignature(walletAddress, signature, nonce);
            res.json(result);
        } catch (err: unknown) {
            res.status(401).json({ error: (err as Error).message });
        }
    });

    // ==========================================
    // User Profile Routes
    // ==========================================
    app.get('/api/user/profile', (req, res) => {
        if (!req.walletAddress) {
            res.status(401).json({ error: 'Wallet address required. Use X-Wallet-Address header or authenticate via /api/auth/verify.' });
            return;
        }
        const user = userStore.getOrCreateUser(req.walletAddress);
        const brandVoice = userStore.getBrandVoice(req.walletAddress);
        const queue = userStore.getContentQueue(req.walletAddress);
        const calendar = userStore.getCalendar(req.walletAddress);
        const sessions = sessionStore.listSessions(req.walletAddress);
        res.json({
            user,
            hasBrandVoice: !!brandVoice,
            queueLength: queue.length,
            hasCalendar: calendar.length > 0,
            sessionCount: sessions.length,
        });
    });

    app.put('/api/user/brand-voice', (req, res) => {
        if (!req.walletAddress) {
            res.status(401).json({ error: 'Wallet address required.' });
            return;
        }
        const profile = req.body;
        if (!profile || !profile.tone) {
            res.status(400).json({ error: 'Brand voice profile is required (at minimum: tone).' });
            return;
        }
        userStore.saveBrandVoice(req.walletAddress, profile);
        res.json({ success: true, walletAddress: req.walletAddress });
    });

    app.get('/api/user/sessions', (req, res) => {
        if (!req.walletAddress) {
            res.status(401).json({ error: 'Wallet address required.' });
            return;
        }
        const sessions = sessionStore.listSessions(req.walletAddress);
        res.json({
            walletAddress: req.walletAddress,
            count: sessions.length,
            sessions: sessions.map(s => ({
                sessionId: s.id,
                isPaid: s.isPaid,
                messageCount: s.messages.length,
                createdAt: s.createdAt,
            })),
        });
    });

    // ==========================================
    // GET /api/health
    // ==========================================
    app.get('/api/health', (_req, res) => {
        res.json({
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        });
    });

    // ==========================================
    // GET /api/agent
    // ==========================================
    app.get('/api/agent', (_req, res) => {
        const config = agentConfig as Record<string, unknown>;
        res.json({
            name: (config.agentName as string) || 'openclaw-bot',
            description: (config.description as string) || '',
            pricing: config.pricing || { perQuery: '0.50', token: 'USDC-350c4e' },
            services: config.services || [],
        });
    });

    // ==========================================
    // POST /api/chat [H-1 FIX: Rate limited]
    // ==========================================
    app.post('/api/chat', chatLimiter, (req, res) => {
        const { message, sessionId } = req.body;

        if (!message || typeof message !== 'string') {
            res.status(400).json({ error: 'message is required and must be a string' });
            return;
        }

        // Sanitize message length
        if (message.length > 10000) {
            res.status(400).json({ error: 'Message too long. Maximum 10,000 characters.' });
            return;
        }

        // Get or create session (bound to wallet if authenticated)
        let session = sessionId ? sessionStore.getSession(sessionId) : undefined;
        if (!session) {
            session = sessionStore.createSession(req.walletAddress);
        }

        // Add user message
        sessionStore.addMessage(session.id, { role: 'user', content: message });

        // Payment gate
        if (!session.isPaid) {
            const pricing = (agentConfig as Record<string, unknown>).pricing as Record<string, string> | undefined;
            res.status(402).json({
                sessionId: session.id,
                payment: {
                    amount: pricing?.perQuery || '0.50',
                    token: pricing?.token || 'USDC-350c4e',
                    receiver: process.env.AGENT_WALLET_ADDRESS || 'erd1...',
                    message: 'Payment required to proceed. Sign the transaction to start your query.',
                },
            });
            return;
        }

        // If paid — stream real agent response via SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const agent = new ContentMachineAgent();
        const context = {
            sessionId: session.id,
            fileIds: session.fileIds || [],
            previousMessages: session.messages.slice(0, -1),
            walletAddress: req.walletAddress,
            userStore,
        };

        // Stream agent events to client
        (async () => {
            try {
                for await (const event of agent.execute(message, context)) {
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                    // Add assistant message when complete
                    if (event.type === 'complete') {
                        // Collect text events we already sent for the session history
                        break;
                    }
                }
            } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                res.write(`data: ${JSON.stringify({ type: 'error', content: errorMsg })}\n\n`);
            } finally {
                res.end();
            }
        })();
    });

    // ==========================================
    // POST /api/chat/confirm-payment [H-1 FIX: Rate limited] [M-4 FIX: Tx verification]
    // ==========================================
    app.post('/api/chat/confirm-payment', paymentLimiter, async (req, res) => {
        const { sessionId, txHash } = req.body;

        if (!sessionId || !txHash) {
            res.status(400).json({ error: 'sessionId and txHash are required' });
            return;
        }

        // Validate txHash format (hex string)
        if (typeof txHash !== 'string' || txHash.length < 10) {
            res.status(400).json({ error: 'Invalid txHash format' });
            return;
        }

        const session = sessionStore.getSession(sessionId);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }

        // [M-4 FIX] Verify tx on-chain
        const verification = await verifyTransactionOnChain(txHash);
        if (!verification.valid) {
            res.status(400).json({
                error: 'Transaction verification failed',
                status: verification.status,
                txHash,
            });
            return;
        }

        const jobId = `job-${uuidv4()}`;
        sessionStore.markPaid(sessionId, txHash, jobId);

        res.json({
            status: 'confirmed',
            jobId,
            message: 'Payment confirmed. You can now send your query.',
            txVerification: verification.status,
        });
    });

    // ==========================================
    // POST /api/upload
    // ==========================================
    app.post('/api/upload', upload.single('file'), (req, res) => {
        if (!req.file) {
            res.status(400).json({ error: 'No file attached. Use field name "file".' });
            return;
        }

        const fileId = uuidv4();
        // [L-4 FIX] Sanitize original filename
        const safeFilename = sanitizeFilename(req.file.originalname);
        res.json({
            fileId,
            filename: safeFilename,
            size: req.file.size,
            message: 'File uploaded successfully.',
        });
    });

    // ==========================================
    // GET /api/download/:jobId
    // ==========================================
    app.get('/api/download/:jobId', (req, res) => {
        const { jobId } = req.params;

        // Validate jobId format to prevent path traversal
        if (!/^job-[\w-]+$/.test(jobId)) {
            res.status(400).json({ error: 'Invalid jobId format' });
            return;
        }

        const reportPath = path.resolve(__dirname, `../reports/${jobId}.pdf`);

        try {
            const fs = require('fs');
            if (!fs.existsSync(reportPath)) {
                res.status(404).json({ error: `No report found for job ${jobId}` });
                return;
            }
            res.download(reportPath, `report-${jobId}.pdf`);
        } catch {
            res.status(404).json({ error: `No report found for job ${jobId}` });
        }
    });

    return app;
}

// Export for testing
export { sanitizeFilename, verifyTransactionOnChain };

// Start server if run directly
if (require.main === module) {
    const port = parseInt(process.env.BACKEND_PORT || '4000', 10);
    const app = createApp();
    app.listen(port, () => {
        console.log(`🚀 The Content Machine running on port ${port}`);
    });
}
