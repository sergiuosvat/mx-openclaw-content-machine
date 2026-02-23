import { PersistentSessionStore, ChatMessage, Session } from './persistent-session-store';
import fs from 'fs';
import path from 'path';

// Set test env
process.env.NODE_ENV = 'test';

const TEST_DB_PATH = path.resolve(__dirname, '../../test-sessions.db');

describe('PersistentSessionStore', () => {
    let store: PersistentSessionStore;

    beforeEach(() => {
        // Clean up test DB before each test
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        store = new PersistentSessionStore(TEST_DB_PATH);
    });

    afterEach(() => {
        store.close();
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    describe('createSession', () => {
        it('should create a session with unique ID persisted to SQLite', () => {
            const session = store.createSession();
            expect(session.id).toBeDefined();
            expect(typeof session.id).toBe('string');
            expect(session.isPaid).toBe(false);
            expect(session.messages).toEqual([]);
            expect(session.fileIds).toEqual([]);
        });

        it('should persist across store instances', () => {
            const session = store.createSession();
            store.close();

            const store2 = new PersistentSessionStore(TEST_DB_PATH);
            const retrieved = store2.getSession(session.id);
            expect(retrieved).toBeDefined();
            expect(retrieved!.id).toBe(session.id);
            store2.close();
        });

        it('should create unique IDs', () => {
            const s1 = store.createSession();
            const s2 = store.createSession();
            expect(s1.id).not.toBe(s2.id);
        });
    });

    describe('getSession', () => {
        it('should return undefined for non-existent session', () => {
            expect(store.getSession('nonexistent')).toBeUndefined();
        });

        it('should return full session with messages', () => {
            const session = store.createSession();
            store.addMessage(session.id, { role: 'user', content: 'Hello' });
            store.addMessage(session.id, { role: 'assistant', content: 'Hi' });

            const retrieved = store.getSession(session.id);
            expect(retrieved!.messages).toHaveLength(2);
            expect(retrieved!.messages[0].content).toBe('Hello');
            expect(retrieved!.messages[1].content).toBe('Hi');
        });
    });

    describe('markPaid', () => {
        it('should persist paid status to SQLite', () => {
            const session = store.createSession();
            store.markPaid(session.id, 'tx-abc', 'job-123');

            store.close();
            const store2 = new PersistentSessionStore(TEST_DB_PATH);
            const retrieved = store2.getSession(session.id);
            expect(retrieved!.isPaid).toBe(true);
            expect(retrieved!.txHash).toBe('tx-abc');
            expect(retrieved!.jobId).toBe('job-123');
            store2.close();
        });

        it('should throw for non-existent session', () => {
            expect(() => store.markPaid('bad-id', 'tx', 'job')).toThrow();
        });
    });

    describe('addMessage', () => {
        it('should persist messages across restarts', () => {
            const session = store.createSession();
            store.addMessage(session.id, { role: 'user', content: 'Test message' });
            store.close();

            const store2 = new PersistentSessionStore(TEST_DB_PATH);
            const retrieved = store2.getSession(session.id);
            expect(retrieved!.messages).toHaveLength(1);
            expect(retrieved!.messages[0].role).toBe('user');
            expect(retrieved!.messages[0].content).toBe('Test message');
            store2.close();
        });

        it('should throw for non-existent session', () => {
            expect(() => store.addMessage('bad', { role: 'user', content: 'x' })).toThrow();
        });
    });

    describe('addFileId', () => {
        it('should persist file IDs', () => {
            const session = store.createSession();
            store.addFileId(session.id, 'file-1');
            store.addFileId(session.id, 'file-2');

            store.close();
            const store2 = new PersistentSessionStore(TEST_DB_PATH);
            const retrieved = store2.getSession(session.id);
            expect(retrieved!.fileIds).toHaveLength(2);
            expect(retrieved!.fileIds).toContain('file-1');
            store2.close();
        });

        it('should throw for non-existent session', () => {
            expect(() => store.addFileId('bad', 'f')).toThrow();
        });
    });

    describe('cleanExpired', () => {
        it('should remove sessions older than TTL', () => {
            const session = store.createSession();
            // Manually set createdAt to 25 hours ago
            store['db'].prepare('UPDATE sessions SET created_at = ? WHERE id = ?')
                .run(Date.now() - 25 * 60 * 60 * 1000, session.id);

            store.cleanExpired(24 * 60 * 60 * 1000); // 24h TTL
            expect(store.getSession(session.id)).toBeUndefined();
        });

        it('should keep non-expired sessions', () => {
            const session = store.createSession();
            store.cleanExpired(24 * 60 * 60 * 1000);
            expect(store.getSession(session.id)).toBeDefined();
        });
    });
});
