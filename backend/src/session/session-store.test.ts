import { SessionStore, Session } from './session-store';

describe('SessionStore', () => {
    let store: SessionStore;

    beforeEach(() => {
        store = new SessionStore();
    });

    describe('createSession', () => {
        it('should create a new session with a unique ID', () => {
            const session = store.createSession();
            expect(session.id).toBeDefined();
            expect(typeof session.id).toBe('string');
            expect(session.id.length).toBeGreaterThan(0);
        });

        it('should create session with isPaid = false by default', () => {
            const session = store.createSession();
            expect(session.isPaid).toBe(false);
        });

        it('should create session with empty messages', () => {
            const session = store.createSession();
            expect(session.messages).toEqual([]);
        });

        it('should create unique IDs for different sessions', () => {
            const s1 = store.createSession();
            const s2 = store.createSession();
            expect(s1.id).not.toBe(s2.id);
        });
    });

    describe('getSession', () => {
        it('should return the session by ID', () => {
            const created = store.createSession();
            const retrieved = store.getSession(created.id);
            expect(retrieved).toBeDefined();
            expect(retrieved!.id).toBe(created.id);
        });

        it('should return undefined for non-existent session', () => {
            const result = store.getSession('non-existent-id');
            expect(result).toBeUndefined();
        });
    });

    describe('markPaid', () => {
        it('should mark a session as paid with txHash and jobId', () => {
            const session = store.createSession();
            store.markPaid(session.id, 'tx-hash-123', 'job-456');
            const updated = store.getSession(session.id);
            expect(updated!.isPaid).toBe(true);
            expect(updated!.txHash).toBe('tx-hash-123');
            expect(updated!.jobId).toBe('job-456');
        });

        it('should throw for non-existent session', () => {
            expect(() => store.markPaid('bad-id', 'tx', 'job')).toThrow();
        });
    });

    describe('addMessage', () => {
        it('should add a user message to the session', () => {
            const session = store.createSession();
            store.addMessage(session.id, { role: 'user', content: 'Hello' });
            const updated = store.getSession(session.id);
            expect(updated!.messages).toHaveLength(1);
            expect(updated!.messages[0].role).toBe('user');
            expect(updated!.messages[0].content).toBe('Hello');
        });

        it('should add a bot message to the session', () => {
            const session = store.createSession();
            store.addMessage(session.id, { role: 'assistant', content: 'Hi there!' });
            const updated = store.getSession(session.id);
            expect(updated!.messages).toHaveLength(1);
            expect(updated!.messages[0].role).toBe('assistant');
        });

        it('should throw for non-existent session', () => {
            expect(() => store.addMessage('bad-id', { role: 'user', content: 'x' })).toThrow();
        });
    });

    describe('addFileId', () => {
        it('should add a file ID to the session', () => {
            const session = store.createSession();
            store.addFileId(session.id, 'file-abc');
            const updated = store.getSession(session.id);
            expect(updated!.fileIds).toContain('file-abc');
        });

        it('should accumulate multiple file IDs', () => {
            const session = store.createSession();
            store.addFileId(session.id, 'file-1');
            store.addFileId(session.id, 'file-2');
            const updated = store.getSession(session.id);
            expect(updated!.fileIds).toHaveLength(2);
        });

        it('should throw for non-existent session', () => {
            expect(() => store.addFileId('bad-id', 'file-x')).toThrow();
        });
    });
});
