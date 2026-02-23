import request from 'supertest';
import { createApp, sanitizeFilename } from '../server';
import path from 'path';
import fs from 'fs';

// Set test environment for tx verification skip
process.env.NODE_ENV = 'test';

describe('API Routes', () => {
    const app = createApp();

    describe('GET /api/health', () => {
        it('should return 200 with status ok', async () => {
            const res = await request(app).get('/api/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
        });

        it('should include uptime and version', async () => {
            const res = await request(app).get('/api/health');
            expect(res.body.uptime).toBeDefined();
            expect(typeof res.body.uptime).toBe('number');
            expect(res.body.version).toBe('1.0.0');
            expect(res.body.timestamp).toBeDefined();
        });
    });

    describe('GET /api/agent', () => {
        it('should return 200 with agent profile', async () => {
            const res = await request(app).get('/api/agent');
            expect(res.status).toBe(200);
            expect(res.body.name).toBeDefined();
            expect(res.body.pricing).toBeDefined();
        });
    });

    describe('POST /api/chat', () => {
        it('should return 400 if no message provided', async () => {
            const res = await request(app)
                .post('/api/chat')
                .send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('message is required');
        });

        it('should return 400 for non-string message', async () => {
            const res = await request(app)
                .post('/api/chat')
                .send({ message: 123 });
            expect(res.status).toBe(400);
        });

        it('should return 400 for message exceeding 10,000 characters', async () => {
            const longMessage = 'a'.repeat(10001);
            const res = await request(app)
                .post('/api/chat')
                .send({ message: longMessage });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('too long');
        });

        it('should create a new session if sessionId is not provided', async () => {
            const res = await request(app)
                .post('/api/chat')
                .send({ message: 'Hello' });
            expect(res.status).toBe(402);
            expect(res.body.sessionId).toBeDefined();
            expect(res.body.payment).toBeDefined();
            expect(res.body.payment.amount).toBeDefined();
            expect(res.body.payment.token).toBeDefined();
            expect(res.body.payment.receiver).toBeDefined();
        });

        it('should return 402 for unpaid session', async () => {
            const res = await request(app)
                .post('/api/chat')
                .send({ message: 'Research AI trends' });
            expect(res.status).toBe(402);
            expect(res.body.payment).toBeDefined();
        });

        it('should return SSE stream for paid session', async () => {
            // First get a session
            const chatRes = await request(app)
                .post('/api/chat')
                .send({ message: 'Hello' });
            const sessionId = chatRes.body.sessionId;

            // Confirm payment (txHash must be >= 10 chars)
            await request(app)
                .post('/api/chat/confirm-payment')
                .send({ sessionId, txHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' });

            // Now send a message to the paid session
            const res = await request(app)
                .post('/api/chat')
                .send({ message: 'Research topic', sessionId });

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            expect(res.text).toContain('data:');
            expect(res.text).toContain('thinking');
            expect(res.text).toContain('complete');
        });
    });

    describe('POST /api/chat/confirm-payment', () => {
        it('should return 400 if sessionId or txHash missing', async () => {
            const res = await request(app)
                .post('/api/chat/confirm-payment')
                .send({});
            expect(res.status).toBe(400);
        });

        it('should return 400 for invalid txHash format', async () => {
            const res = await request(app)
                .post('/api/chat/confirm-payment')
                .send({ sessionId: 'some-id', txHash: 'short' });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Invalid txHash');
        });

        it('should return 404 for non-existent session', async () => {
            const res = await request(app)
                .post('/api/chat/confirm-payment')
                .send({ sessionId: 'fake-id', txHash: 'tx-123456789012345' });
            expect(res.status).toBe(404);
        });

        it('should confirm payment for valid session', async () => {
            // Create a session first
            const chatRes = await request(app)
                .post('/api/chat')
                .send({ message: 'Hello' });
            const sessionId = chatRes.body.sessionId;

            const res = await request(app)
                .post('/api/chat/confirm-payment')
                .send({ sessionId, txHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' });
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('confirmed');
            expect(res.body.jobId).toBeDefined();
            expect(res.body.txVerification).toBeDefined();
        });
    });

    describe('POST /api/upload', () => {
        it('should return 400 if no file attached', async () => {
            const res = await request(app)
                .post('/api/upload');
            expect(res.status).toBe(400);
        });

        it('should accept a valid text file upload', async () => {
            // Create a temp file
            const tmpDir = path.resolve(__dirname, '../../uploads');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

            const res = await request(app)
                .post('/api/upload')
                .attach('file', Buffer.from('test content'), 'testfile.txt');

            expect(res.status).toBe(200);
            expect(res.body.fileId).toBeDefined();
            expect(res.body.filename).toBeDefined();
            expect(res.body.size).toBeGreaterThan(0);
            expect(res.body.message).toContain('success');
        });
    });

    describe('GET /api/download/:jobId', () => {
        it('should return 404 for non-existent job', async () => {
            const res = await request(app).get('/api/download/job-fake-id');
            expect(res.status).toBe(404);
        });

        it('should return 400 for invalid jobId format', async () => {
            const res = await request(app).get('/api/download/DROP_TABLE');
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Invalid jobId');
        });
    });

    describe('Security Headers', () => {
        it('should include helmet security headers', async () => {
            const res = await request(app).get('/api/health');
            // Helmet adds these headers
            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        });
    });
});

describe('sanitizeFilename', () => {
    it('should sanitize special characters', () => {
        expect(sanitizeFilename('test<script>.txt')).toBe('test_script_.txt');
    });

    it('should collapse multiple dots', () => {
        expect(sanitizeFilename('file....txt')).toBe('file.txt');
    });

    it('should replace leading dot', () => {
        expect(sanitizeFilename('.hidden')).toBe('_hidden');
    });

    it('should cap length at 200 characters', () => {
        const longName = 'a'.repeat(300) + '.txt';
        expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(200);
    });

    it('should handle normal filenames unchanged', () => {
        expect(sanitizeFilename('my-report.pdf')).toBe('my-report.pdf');
    });
});
