import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
}

export interface Session {
    id: string;
    walletAddress?: string;
    isPaid: boolean;
    txHash?: string;
    jobId?: string;
    messages: ChatMessage[];
    createdAt: number;
    fileIds: string[];
}

export class SessionStore {
    private sessions: Map<string, Session> = new Map();

    createSession(walletAddress?: string): Session {
        const session: Session = {
            id: uuidv4(),
            walletAddress,
            isPaid: false,
            messages: [],
            createdAt: Date.now(),
            fileIds: [],
        };
        this.sessions.set(session.id, session);
        return session;
    }

    getSession(id: string): Session | undefined {
        return this.sessions.get(id);
    }

    markPaid(id: string, txHash: string, jobId: string): void {
        const session = this.sessions.get(id);
        if (!session) {
            throw new Error(`Session not found: ${id}`);
        }
        session.isPaid = true;
        session.txHash = txHash;
        session.jobId = jobId;
    }

    addMessage(id: string, message: ChatMessage): void {
        const session = this.sessions.get(id);
        if (!session) {
            throw new Error(`Session not found: ${id}`);
        }
        session.messages.push({
            ...message,
            timestamp: message.timestamp ?? Date.now(),
        });
    }

    addFileId(id: string, fileId: string): void {
        const session = this.sessions.get(id);
        if (!session) {
            throw new Error(`Session not found: ${id}`);
        }
        session.fileIds.push(fileId);
    }

    listSessions(walletAddress?: string): Session[] {
        const all = Array.from(this.sessions.values());
        if (walletAddress) {
            return all.filter(s => s.walletAddress === walletAddress);
        }
        return all;
    }

    deleteSession(id: string): boolean {
        return this.sessions.delete(id);
    }
}
