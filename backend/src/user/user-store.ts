/**
 * UserStore — Per-user persistent storage backed by SQLite.
 *
 * Each MultiversX wallet address is a unique user with:
 * - Brand voice profile
 * - Content queue
 * - Content calendar
 */
import Database from 'better-sqlite3';

// ─── Types ────────────────────────────────────────────────────────────────

export interface UserProfile {
    walletAddress: string;
    createdAt: number;
    lastActive: number;
}

export interface BrandVoiceProfile {
    tone: string;
    vocabulary: string[];
    doList: string[];
    dontList: string[];
    examplePosts: string[];
    hashtagStrategy: string;
    targetAudience: string;
    contentPillars: string[];
}

export interface QueueItem {
    id: string;
    walletAddress: string;
    platform: string;
    content: string;
    scheduledTime: string;
    status: 'queued' | 'published' | 'failed';
    createdAt: string;
}

// ─── UserStore ────────────────────────────────────────────────────────────

export class UserStore {
    private db: Database.Database;

    constructor(dbPath: string = 'users.db') {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.initSchema();
    }

    private initSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                wallet_address TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                last_active INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_brand_voice (
                wallet_address TEXT PRIMARY KEY,
                profile_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_content_queue (
                id TEXT PRIMARY KEY,
                wallet_address TEXT NOT NULL,
                platform TEXT NOT NULL,
                content TEXT NOT NULL,
                scheduled_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                created_at TEXT NOT NULL,
                FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_content_calendar (
                wallet_address TEXT NOT NULL,
                week_start TEXT NOT NULL,
                calendar_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (wallet_address, week_start),
                FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_queue_wallet ON user_content_queue(wallet_address);
            CREATE INDEX IF NOT EXISTS idx_calendar_wallet ON user_content_calendar(wallet_address);
        `);
    }

    // ─── User CRUD ────────────────────────────────────────────────────────

    getOrCreateUser(walletAddress: string): UserProfile {
        const now = Date.now();

        const existing = this.db
            .prepare('SELECT * FROM users WHERE wallet_address = ?')
            .get(walletAddress) as { wallet_address: string; created_at: number; last_active: number } | undefined;

        if (existing) {
            // Update last_active
            this.db.prepare('UPDATE users SET last_active = ? WHERE wallet_address = ?').run(now, walletAddress);
            return {
                walletAddress: existing.wallet_address,
                createdAt: existing.created_at,
                lastActive: now,
            };
        }

        this.db
            .prepare('INSERT INTO users (wallet_address, created_at, last_active) VALUES (?, ?, ?)')
            .run(walletAddress, now, now);

        return { walletAddress, createdAt: now, lastActive: now };
    }

    getUser(walletAddress: string): UserProfile | undefined {
        const row = this.db
            .prepare('SELECT * FROM users WHERE wallet_address = ?')
            .get(walletAddress) as { wallet_address: string; created_at: number; last_active: number } | undefined;

        if (!row) return undefined;
        return {
            walletAddress: row.wallet_address,
            createdAt: row.created_at,
            lastActive: row.last_active,
        };
    }

    // ─── Brand Voice ──────────────────────────────────────────────────────

    getBrandVoice(walletAddress: string): BrandVoiceProfile | null {
        const row = this.db
            .prepare('SELECT profile_json FROM user_brand_voice WHERE wallet_address = ?')
            .get(walletAddress) as { profile_json: string } | undefined;

        if (!row) return null;
        return JSON.parse(row.profile_json) as BrandVoiceProfile;
    }

    saveBrandVoice(walletAddress: string, profile: BrandVoiceProfile): void {
        const now = Date.now();
        this.db
            .prepare(`
                INSERT INTO user_brand_voice (wallet_address, profile_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(wallet_address) DO UPDATE SET profile_json = ?, updated_at = ?
            `)
            .run(walletAddress, JSON.stringify(profile), now, JSON.stringify(profile), now);
    }

    // ─── Content Queue ────────────────────────────────────────────────────

    getContentQueue(walletAddress: string): QueueItem[] {
        const rows = this.db
            .prepare('SELECT * FROM user_content_queue WHERE wallet_address = ? ORDER BY created_at DESC')
            .all(walletAddress) as Array<{
                id: string;
                wallet_address: string;
                platform: string;
                content: string;
                scheduled_time: string;
                status: string;
                created_at: string;
            }>;

        return rows.map(row => ({
            id: row.id,
            walletAddress: row.wallet_address,
            platform: row.platform,
            content: row.content,
            scheduledTime: row.scheduled_time,
            status: row.status as QueueItem['status'],
            createdAt: row.created_at,
        }));
    }

    addToQueue(walletAddress: string, item: Omit<QueueItem, 'walletAddress'>): QueueItem {
        this.db
            .prepare(`
                INSERT INTO user_content_queue (id, wallet_address, platform, content, scheduled_time, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `)
            .run(item.id, walletAddress, item.platform, item.content, item.scheduledTime, item.status, item.createdAt);

        return { ...item, walletAddress };
    }

    clearQueue(walletAddress: string): number {
        const result = this.db
            .prepare('DELETE FROM user_content_queue WHERE wallet_address = ?')
            .run(walletAddress);
        return result.changes;
    }

    // ─── Content Calendar ─────────────────────────────────────────────────

    getCalendar(walletAddress: string, weekStart?: string): unknown[] {
        if (weekStart) {
            const row = this.db
                .prepare('SELECT calendar_json FROM user_content_calendar WHERE wallet_address = ? AND week_start = ?')
                .get(walletAddress, weekStart) as { calendar_json: string } | undefined;

            return row ? JSON.parse(row.calendar_json) as unknown[] : [];
        }

        // Get the most recent calendar
        const row = this.db
            .prepare('SELECT calendar_json FROM user_content_calendar WHERE wallet_address = ? ORDER BY week_start DESC LIMIT 1')
            .get(walletAddress) as { calendar_json: string } | undefined;

        return row ? JSON.parse(row.calendar_json) as unknown[] : [];
    }

    saveCalendar(walletAddress: string, weekStart: string, calendar: unknown[]): void {
        const now = Date.now();
        this.db
            .prepare(`
                INSERT INTO user_content_calendar (wallet_address, week_start, calendar_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(wallet_address, week_start) DO UPDATE SET calendar_json = ?, updated_at = ?
            `)
            .run(walletAddress, weekStart, JSON.stringify(calendar), now, JSON.stringify(calendar), now);
    }

    // ─── Cleanup ──────────────────────────────────────────────────────────

    close(): void {
        this.db.close();
    }
}
