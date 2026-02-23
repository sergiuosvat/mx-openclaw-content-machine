import Database from 'better-sqlite3';
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

/**
 * SQLite-backed session store for production use.
 * Persists sessions across server restarts.
 */
export class PersistentSessionStore {
    private db: Database.Database;

    constructor(dbPath: string = 'sessions.db') {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.initSchema();
    }

    private initSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                wallet_address TEXT,
                is_paid INTEGER DEFAULT 0,
                tx_hash TEXT,
                job_id TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS file_ids (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                file_id TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_file_ids_session ON file_ids(session_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions(wallet_address);
        `);
    }

    createSession(walletAddress?: string): Session {
        const id = uuidv4();
        const createdAt = Date.now();

        this.db.prepare('INSERT INTO sessions (id, wallet_address, created_at) VALUES (?, ?, ?)').run(id, walletAddress || null, createdAt);

        return {
            id,
            walletAddress,
            isPaid: false,
            messages: [],
            createdAt,
            fileIds: [],
        };
    }

    getSession(id: string): Session | undefined {
        const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
            | { id: string; wallet_address: string | null; is_paid: number; tx_hash: string | null; job_id: string | null; created_at: number }
            | undefined;

        if (!row) return undefined;

        const messages = this.db
            .prepare('SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY id')
            .all(id) as ChatMessage[];

        const fileRows = this.db
            .prepare('SELECT file_id FROM file_ids WHERE session_id = ? ORDER BY id')
            .all(id) as { file_id: string }[];

        return {
            id: row.id,
            walletAddress: row.wallet_address ?? undefined,
            isPaid: row.is_paid === 1,
            txHash: row.tx_hash ?? undefined,
            jobId: row.job_id ?? undefined,
            messages,
            createdAt: row.created_at,
            fileIds: fileRows.map((r) => r.file_id),
        };
    }

    /**
     * Get all sessions for a specific wallet address.
     * Used for "resume yesterday's conversation" feature.
     */
    getSessionsByWallet(walletAddress: string): Session[] {
        const rows = this.db
            .prepare('SELECT id FROM sessions WHERE wallet_address = ? ORDER BY created_at DESC')
            .all(walletAddress) as { id: string }[];

        return rows.map(row => this.getSession(row.id)).filter(Boolean) as Session[];
    }

    markPaid(id: string, txHash: string, jobId: string): void {
        const result = this.db
            .prepare('UPDATE sessions SET is_paid = 1, tx_hash = ?, job_id = ? WHERE id = ?')
            .run(txHash, jobId, id);

        if (result.changes === 0) {
            throw new Error(`Session not found: ${id}`);
        }
    }

    addMessage(id: string, message: ChatMessage): void {
        const session = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(id);
        if (!session) {
            throw new Error(`Session not found: ${id}`);
        }

        this.db
            .prepare('INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)')
            .run(id, message.role, message.content, message.timestamp ?? Date.now());
    }

    addFileId(id: string, fileId: string): void {
        const session = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(id);
        if (!session) {
            throw new Error(`Session not found: ${id}`);
        }

        this.db.prepare('INSERT INTO file_ids (session_id, file_id) VALUES (?, ?)').run(id, fileId);
    }

    /**
     * Remove sessions older than ttlMs milliseconds.
     * Used by the cron service.
     */
    cleanExpired(ttlMs: number): number {
        const cutoff = Date.now() - ttlMs;
        // Delete cascade will handle messages and file_ids
        const result = this.db.prepare('DELETE FROM sessions WHERE created_at < ?').run(cutoff);
        return result.changes;
    }

    close(): void {
        this.db.close();
    }
}
