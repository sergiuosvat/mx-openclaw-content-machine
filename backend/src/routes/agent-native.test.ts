import request from 'supertest';
import { createApp } from '../server';
import { updateJob } from './agent-native';

process.env.NODE_ENV = 'test';

const app = createApp();

describe('Agent-Native API Routes', () => {

    // ====================================================================
    // 1. CAPABILITIES — Dynamic Capability Discovery
    // ====================================================================
    describe('GET /api/capabilities', () => {
        it('should return full capability manifest', async () => {
            const res = await request(app).get('/api/capabilities');
            expect(res.status).toBe(200);
            expect(res.body.apiVersion).toBe('1.0.0');
            expect(res.body.agentStandard).toBe('MX-8004');
            expect(Array.isArray(res.body.capabilities)).toBe(true);
            expect(res.body.capabilities.length).toBeGreaterThanOrEqual(8);
            expect(res.body.supportedProtocols).toContain('x402');
            expect(res.body.responseFormats).toContain('json');
        });

        it('should include all CRUD endpoints in capabilities', async () => {
            const res = await request(app).get('/api/capabilities');
            const names = res.body.capabilities.map((c: { name: string }) => c.name);
            expect(names).toContain('chat');
            expect(names).toContain('confirm-payment');
            expect(names).toContain('get-session');
            expect(names).toContain('list-sessions');
            expect(names).toContain('delete-session');
            expect(names).toContain('get-job-status');
        });
    });

    // ====================================================================
    // 2. SESSION CRUD
    // ====================================================================
    describe('Session CRUD', () => {
        it('should create a session via POST /api/sessions', async () => {
            const res = await request(app).post('/api/sessions');
            expect(res.status).toBe(201);
            expect(res.body.sessionId).toBeDefined();
            expect(res.body.isPaid).toBe(false);
        });

        it('should read a session via GET /api/sessions/:id', async () => {
            const createRes = await request(app).post('/api/sessions');
            const sessionId = createRes.body.sessionId;

            const res = await request(app).get(`/api/sessions/${sessionId}`);
            expect(res.status).toBe(200);
            expect(res.body.sessionId).toBe(sessionId);
            expect(res.body.isPaid).toBe(false);
            expect(Array.isArray(res.body.messages)).toBe(true);
            expect(Array.isArray(res.body.fileIds)).toBe(true);
        });

        it('should return 404 for non-existent session', async () => {
            const res = await request(app).get('/api/sessions/nonexistent-id');
            expect(res.status).toBe(404);
        });

        it('should list all sessions via GET /api/sessions', async () => {
            const res = await request(app).get('/api/sessions');
            expect(res.status).toBe(200);
            expect(typeof res.body.count).toBe('number');
            expect(Array.isArray(res.body.sessions)).toBe(true);
        });

        it('should delete a session via DELETE /api/sessions/:id', async () => {
            const createRes = await request(app).post('/api/sessions');
            const sessionId = createRes.body.sessionId;

            const delRes = await request(app).delete(`/api/sessions/${sessionId}`);
            expect(delRes.status).toBe(200);
            expect(delRes.body.deleted).toBe(true);

            // Verify it's gone
            const getRes = await request(app).get(`/api/sessions/${sessionId}`);
            expect(getRes.status).toBe(404);
        });

        it('should return 404 when deleting non-existent session', async () => {
            const res = await request(app).delete('/api/sessions/bad-id');
            expect(res.status).toBe(404);
        });
    });

    // ====================================================================
    // 3. JOB STATUS — Explicit Completion Signals
    // ====================================================================
    describe('Job Status', () => {
        it('should return job status with completion signal', async () => {
            updateJob('job-test-1', { status: 'completed', result: 'done' });

            const res = await request(app).get('/api/jobs/job-test-1');
            expect(res.status).toBe(200);
            expect(res.body.jobId).toBe('job-test-1');
            expect(res.body.status).toBe('completed');
            expect(res.body.isComplete).toBe(true);
            expect(res.body.shouldContinue).toBe(false);
        });

        it('should signal shouldContinue for in-progress jobs', async () => {
            updateJob('job-test-2', { status: 'in_progress' });

            const res = await request(app).get('/api/jobs/job-test-2');
            expect(res.status).toBe(200);
            expect(res.body.isComplete).toBe(false);
            expect(res.body.shouldContinue).toBe(true);
        });

        it('should return 404 for non-existent job', async () => {
            const res = await request(app).get('/api/jobs/job-nonexistent');
            expect(res.status).toBe(404);
        });

        it('should return 400 for invalid job ID format', async () => {
            const res = await request(app).get('/api/jobs/INVALID');
            expect(res.status).toBe(400);
        });

        it('should list all jobs via GET /api/jobs', async () => {
            const res = await request(app).get('/api/jobs');
            expect(res.status).toBe(200);
            expect(typeof res.body.count).toBe('number');
            expect(Array.isArray(res.body.jobs)).toBe(true);
        });
    });

    // ====================================================================
    // 4. PARITY VERIFICATION
    // ====================================================================
    describe('Agent-Native Parity', () => {
        it('every capability endpoint should be reachable', async () => {
            const capRes = await request(app).get('/api/capabilities');
            const capabilities = capRes.body.capabilities;

            // Verify GET endpoints are reachable (not 404 method-not-allowed)
            const getEndpoints = capabilities.filter((c: { method: string }) => c.method === 'GET');
            for (const cap of getEndpoints) {
                if (cap.endpoint.includes(':')) continue; // Skip parameterized
                const res = await request(app).get(cap.endpoint);
                expect(res.status).not.toBe(405); // Method allowed
            }
        });
    });
});
