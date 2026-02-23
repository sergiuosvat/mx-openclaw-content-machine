/**
 * API Service — Typed client for the OpenClaw backend.
 *
 * All backend API calls go through this service.
 * Configure via NEXT_PUBLIC_API_URL environment variable.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface AgentCapabilities {
    name: string;
    version: string;
    endpoints: Array<{
        method: string;
        path: string;
        description: string;
    }>;
}

export interface AgentInfo {
    name: string;
    description: string;
    pricing: { perQuery: string; token: string };
    services: Array<{ id: string; name: string; description: string }>;
}

export interface SessionInfo {
    sessionId: string;
    isPaid: boolean;
    messages: Array<{ role: string; content: string }>;
    fileIds: string[];
}

export interface JobStatus {
    jobId: string;
    status: string;
    isComplete: boolean;
    shouldContinue: boolean;
}

class ApiService {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || `API error: ${response.status}`);
        }

        return response.json();
    }

    // ── Agent Discovery ──────────────────────────────────────────────
    async getCapabilities(): Promise<AgentCapabilities> {
        return this.request('/api/capabilities');
    }

    async getAgentInfo(): Promise<AgentInfo> {
        return this.request('/api/agent');
    }

    // ── Sessions ─────────────────────────────────────────────────────
    async createSession(): Promise<SessionInfo> {
        return this.request('/api/sessions', { method: 'POST' });
    }

    async getSession(sessionId: string): Promise<SessionInfo> {
        return this.request(`/api/sessions/${sessionId}`);
    }

    async listSessions(): Promise<SessionInfo[]> {
        const data = await this.request<{ sessions: SessionInfo[] }>('/api/sessions');
        return data.sessions;
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    }

    // ── Jobs ─────────────────────────────────────────────────────────
    async getJobStatus(jobId: string): Promise<JobStatus> {
        return this.request(`/api/jobs/${jobId}`);
    }

    async listJobs(): Promise<JobStatus[]> {
        const data = await this.request<{ jobs: JobStatus[] }>('/api/jobs');
        return data.jobs;
    }

    // ── File Upload ──────────────────────────────────────────────────
    async uploadFile(file: File): Promise<{ fileId: string; filename: string }> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${this.baseUrl}/api/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('File upload failed');
        }

        return response.json();
    }

    // ── Health ────────────────────────────────────────────────────────
    async health(): Promise<{ status: string }> {
        return this.request('/api/health');
    }
}

// Singleton instance
export const api = new ApiService();
export default api;
