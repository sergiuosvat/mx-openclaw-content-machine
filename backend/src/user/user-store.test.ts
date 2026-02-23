import { UserStore } from './user-store';
import { promises as fs } from 'fs';
import path from 'path';

const TEST_DB = path.resolve(__dirname, 'test-users.db');

describe('UserStore', () => {
    let store: UserStore;

    beforeEach(() => {
        store = new UserStore(TEST_DB);
    });

    afterEach(() => {
        store.close();
        try { require('fs').unlinkSync(TEST_DB); } catch { /* ignore */ }
        try { require('fs').unlinkSync(TEST_DB + '-wal'); } catch { /* ignore */ }
        try { require('fs').unlinkSync(TEST_DB + '-shm'); } catch { /* ignore */ }
    });

    const WALLET_A = 'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3';
    const WALLET_B = 'erd1qqqqqqqqqqqqqqqpgqp83fextsmhsecqv0dn9k2grjt0p69y2l2jsx740de';

    describe('User CRUD', () => {
        it('should create a user on first interaction', () => {
            const user = store.getOrCreateUser(WALLET_A);
            expect(user.walletAddress).toBe(WALLET_A);
            expect(user.createdAt).toBeGreaterThan(0);
        });

        it('should return existing user on subsequent interactions', () => {
            const first = store.getOrCreateUser(WALLET_A);
            const second = store.getOrCreateUser(WALLET_A);
            expect(first.createdAt).toBe(second.createdAt);
            expect(second.lastActive).toBeGreaterThanOrEqual(first.lastActive);
        });

        it('should isolate users', () => {
            store.getOrCreateUser(WALLET_A);
            store.getOrCreateUser(WALLET_B);
            expect(store.getUser(WALLET_A)?.walletAddress).toBe(WALLET_A);
            expect(store.getUser(WALLET_B)?.walletAddress).toBe(WALLET_B);
        });

        it('should return undefined for unknown user', () => {
            expect(store.getUser('erd1unknown')).toBeUndefined();
        });
    });

    describe('Brand Voice', () => {
        it('should return null when no brand voice exists', () => {
            store.getOrCreateUser(WALLET_A);
            expect(store.getBrandVoice(WALLET_A)).toBeNull();
        });

        it('should save and retrieve brand voice', () => {
            store.getOrCreateUser(WALLET_A);
            const profile = {
                tone: 'Casual and fun',
                vocabulary: ['awesome', 'epic'],
                doList: ['Be funny'],
                dontList: ['Be boring'],
                examplePosts: ['This is epic!'],
                hashtagStrategy: '3 max',
                targetAudience: 'Gen Z',
                contentPillars: ['Memes'],
            };
            store.saveBrandVoice(WALLET_A, profile);

            const retrieved = store.getBrandVoice(WALLET_A);
            expect(retrieved?.tone).toBe('Casual and fun');
            expect(retrieved?.vocabulary).toEqual(['awesome', 'epic']);
        });

        it('should isolate brand voices between users', () => {
            store.getOrCreateUser(WALLET_A);
            store.getOrCreateUser(WALLET_B);
            store.saveBrandVoice(WALLET_A, {
                tone: 'Professional', vocabulary: [], doList: [], dontList: [],
                examplePosts: [], hashtagStrategy: '', targetAudience: '', contentPillars: [],
            });
            store.saveBrandVoice(WALLET_B, {
                tone: 'Casual', vocabulary: [], doList: [], dontList: [],
                examplePosts: [], hashtagStrategy: '', targetAudience: '', contentPillars: [],
            });

            expect(store.getBrandVoice(WALLET_A)?.tone).toBe('Professional');
            expect(store.getBrandVoice(WALLET_B)?.tone).toBe('Casual');
        });

        it('should update brand voice on save', () => {
            store.getOrCreateUser(WALLET_A);
            const v1 = {
                tone: 'V1', vocabulary: [], doList: [], dontList: [],
                examplePosts: [], hashtagStrategy: '', targetAudience: '', contentPillars: [],
            };
            store.saveBrandVoice(WALLET_A, v1);
            expect(store.getBrandVoice(WALLET_A)?.tone).toBe('V1');

            const v2 = { ...v1, tone: 'V2' };
            store.saveBrandVoice(WALLET_A, v2);
            expect(store.getBrandVoice(WALLET_A)?.tone).toBe('V2');
        });
    });

    describe('Content Queue', () => {
        it('should return empty queue for new user', () => {
            store.getOrCreateUser(WALLET_A);
            expect(store.getContentQueue(WALLET_A)).toEqual([]);
        });

        it('should add items to queue', () => {
            store.getOrCreateUser(WALLET_A);
            store.addToQueue(WALLET_A, {
                id: 'q1',
                platform: 'twitter',
                content: 'Hello world!',
                scheduledTime: '2026-03-01T10:00:00Z',
                status: 'queued',
                createdAt: new Date().toISOString(),
            });

            const queue = store.getContentQueue(WALLET_A);
            expect(queue).toHaveLength(1);
            expect(queue[0].platform).toBe('twitter');
            expect(queue[0].walletAddress).toBe(WALLET_A);
        });

        it('should isolate queues between users', () => {
            store.getOrCreateUser(WALLET_A);
            store.getOrCreateUser(WALLET_B);
            store.addToQueue(WALLET_A, {
                id: 'qa', platform: 'twitter', content: 'A post',
                scheduledTime: '', status: 'queued', createdAt: '',
            });
            store.addToQueue(WALLET_B, {
                id: 'qb', platform: 'linkedin', content: 'B post',
                scheduledTime: '', status: 'queued', createdAt: '',
            });

            expect(store.getContentQueue(WALLET_A)).toHaveLength(1);
            expect(store.getContentQueue(WALLET_B)).toHaveLength(1);
            expect(store.getContentQueue(WALLET_A)[0].content).toBe('A post');
        });

        it('should clear queue for specific user', () => {
            store.getOrCreateUser(WALLET_A);
            store.getOrCreateUser(WALLET_B);
            store.addToQueue(WALLET_A, {
                id: 'q1', platform: 'x', content: 'A', scheduledTime: '', status: 'queued', createdAt: '',
            });
            store.addToQueue(WALLET_B, {
                id: 'q2', platform: 'x', content: 'B', scheduledTime: '', status: 'queued', createdAt: '',
            });

            store.clearQueue(WALLET_A);
            expect(store.getContentQueue(WALLET_A)).toHaveLength(0);
            expect(store.getContentQueue(WALLET_B)).toHaveLength(1);
        });
    });

    describe('Content Calendar', () => {
        it('should return empty calendar for new user', () => {
            store.getOrCreateUser(WALLET_A);
            expect(store.getCalendar(WALLET_A)).toEqual([]);
        });

        it('should save and retrieve calendar', () => {
            store.getOrCreateUser(WALLET_A);
            const cal = [{ day: 'Monday', platforms: [{ platform: 'x', topic: 'AI' }] }];
            store.saveCalendar(WALLET_A, '2026-03-02', cal);

            const retrieved = store.getCalendar(WALLET_A, '2026-03-02');
            expect(retrieved).toEqual(cal);
        });

        it('should return most recent calendar when no weekStart specified', () => {
            store.getOrCreateUser(WALLET_A);
            store.saveCalendar(WALLET_A, '2026-03-02', [{ week: 1 }]);
            store.saveCalendar(WALLET_A, '2026-03-09', [{ week: 2 }]);

            const latest = store.getCalendar(WALLET_A);
            expect(latest).toEqual([{ week: 2 }]);
        });

        it('should isolate calendars between users', () => {
            store.getOrCreateUser(WALLET_A);
            store.getOrCreateUser(WALLET_B);
            store.saveCalendar(WALLET_A, '2026-03-02', [{ user: 'A' }]);
            store.saveCalendar(WALLET_B, '2026-03-02', [{ user: 'B' }]);

            expect(store.getCalendar(WALLET_A, '2026-03-02')).toEqual([{ user: 'A' }]);
            expect(store.getCalendar(WALLET_B, '2026-03-02')).toEqual([{ user: 'B' }]);
        });
    });
});
