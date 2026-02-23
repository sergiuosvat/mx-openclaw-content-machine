import { Router, Request, Response } from 'express';
import { SessionStore } from '../session/session-store';

/**
 * Agent-Native API Routes
 *
 * These endpoints exist so that OTHER agents (or the orchestrator) can interact
 * with this agent programmatically — full parity with everything the UI can do.
 *
 * Design principles (per agent-driver-architect):
 * 1. PARITY — every UI action has an API equivalent
 * 2. GRANULARITY — atomic primitives, not bundled workflows
 * 3. COMPOSABILITY — new features = new prompts, not new code
 * 4. CRUD COMPLETENESS — every entity supports create/read/update/delete
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface AgentCapability {
    name: string;
    description: string;
    endpoint: string;
    method: string;
    parameters?: Record<string, { type: string; required: boolean; description: string }>;
}

export interface JobStatus {
    jobId: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'timeout';
    result?: unknown;
    proofHash?: string;
    startedAt?: number;
    completedAt?: number;
    agentNonce?: number;
}

// ─── In-memory job tracker ────────────────────────────────────────────────

const jobStore = new Map<string, JobStatus>();

export function updateJob(jobId: string, update: Partial<JobStatus>): void {
    const existing = jobStore.get(jobId) || { jobId, status: 'pending' as const };
    jobStore.set(jobId, { ...existing, ...update });
}

export function getJob(jobId: string): JobStatus | undefined {
    return jobStore.get(jobId);
}

// ─── Route Factory ────────────────────────────────────────────────────────

export function createAgentNativeRoutes(sessionStore: SessionStore): Router {
    const router = Router();

    // ──────────────────────────────────────────────────────────────────────
    // GET /api/capabilities — Dynamic Capability Discovery
    // "What can you do?" — the orchestrator's first call
    // ──────────────────────────────────────────────────────────────────────
    router.get('/capabilities', (_req: Request, res: Response) => {
        const capabilities: AgentCapability[] = [
            {
                name: 'chat',
                description: 'Send a message to this agent and receive a response',
                endpoint: '/api/chat',
                method: 'POST',
                parameters: {
                    message: { type: 'string', required: true, description: 'The message to send' },
                    sessionId: { type: 'string', required: false, description: 'Existing session ID' },
                    responseFormat: { type: 'string', required: false, description: '"stream" (SSE) or "json" (structured)' },
                },
            },
            {
                name: 'confirm-payment',
                description: 'Confirm an x402 payment for a session',
                endpoint: '/api/chat/confirm-payment',
                method: 'POST',
                parameters: {
                    sessionId: { type: 'string', required: true, description: 'Session to mark as paid' },
                    txHash: { type: 'string', required: true, description: 'On-chain transaction hash' },
                },
            },
            {
                name: 'upload',
                description: 'Upload a file for context in a chat session',
                endpoint: '/api/upload',
                method: 'POST',
                parameters: {
                    file: { type: 'file', required: true, description: 'File (pdf, csv, txt, docx, md)' },
                },
            },
            {
                name: 'download',
                description: 'Download a report by job ID',
                endpoint: '/api/download/:jobId',
                method: 'GET',
                parameters: {
                    jobId: { type: 'string', required: true, description: 'Job ID from a completed task' },
                },
            },
            {
                name: 'get-session',
                description: 'Get full session details including messages and payment status',
                endpoint: '/api/sessions/:sessionId',
                method: 'GET',
            },
            {
                name: 'list-sessions',
                description: 'List all active sessions',
                endpoint: '/api/sessions',
                method: 'GET',
            },
            {
                name: 'delete-session',
                description: 'Delete / close a session',
                endpoint: '/api/sessions/:sessionId',
                method: 'DELETE',
            },
            {
                name: 'get-job-status',
                description: 'Check the status and result of a specific job',
                endpoint: '/api/jobs/:jobId',
                method: 'GET',
            },
            {
                name: 'health',
                description: 'Check agent health and uptime',
                endpoint: '/api/health',
                method: 'GET',
            },
            {
                name: 'agent-profile',
                description: 'Get agent identity, pricing, and services',
                endpoint: '/api/agent',
                method: 'GET',
            },
        ];

        res.json({
            apiVersion: '1.0.0',
            agentStandard: 'MX-8004',
            capabilities,
            supportedProtocols: ['x402', 'MCP', 'A2A'],
            responseFormats: ['stream', 'json'],
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // Session CRUD
    // ──────────────────────────────────────────────────────────────────────

    // CREATE — POST /api/sessions
    router.post('/sessions', (_req: Request, res: Response) => {
        const session = sessionStore.createSession();
        res.status(201).json({
            sessionId: session.id,
            isPaid: session.isPaid,
            createdAt: new Date().toISOString(),
        });
    });

    // READ — GET /api/sessions/:sessionId
    router.get('/sessions/:sessionId', (req: Request, res: Response) => {
        const session = sessionStore.getSession(req.params.sessionId as string);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json({
            sessionId: session.id,
            isPaid: session.isPaid,
            txHash: session.txHash,
            jobId: session.jobId,
            messages: session.messages,
            fileIds: session.fileIds,
        });
    });

    // LIST — GET /api/sessions
    router.get('/sessions', (_req: Request, res: Response) => {
        const sessions = sessionStore.listSessions();
        res.json({
            count: sessions.length,
            sessions: sessions.map((s) => ({
                sessionId: s.id,
                isPaid: s.isPaid,
                messageCount: s.messages.length,
            })),
        });
    });

    // DELETE — DELETE /api/sessions/:sessionId
    router.delete('/sessions/:sessionId', (req: Request, res: Response) => {
        const deleted = sessionStore.deleteSession(req.params.sessionId as string);
        if (!deleted) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json({ deleted: true, sessionId: req.params.sessionId as string });
    });

    // ──────────────────────────────────────────────────────────────────────
    // Job Status — explicit completion signals
    // ──────────────────────────────────────────────────────────────────────

    // READ — GET /api/jobs/:jobId
    router.get('/jobs/:jobId', (req: Request, res: Response) => {
        const jobId = req.params.jobId as string;

        // Validate format
        if (!/^job-[\w-]+$/.test(jobId)) {
            res.status(400).json({ error: 'Invalid jobId format' });
            return;
        }

        const job = getJob(jobId);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        res.json({
            ...job,
            isComplete: job.status === 'completed' || job.status === 'failed',
            shouldContinue: job.status === 'pending' || job.status === 'in_progress',
        });
    });

    // LIST — GET /api/jobs
    router.get('/jobs', (_req: Request, res: Response) => {
        const jobs = Array.from(jobStore.values());
        res.json({
            count: jobs.length,
            jobs: jobs.map((j) => ({
                jobId: j.jobId,
                status: j.status,
                isComplete: j.status === 'completed' || j.status === 'failed',
            })),
        });
    });

    return router;
}
