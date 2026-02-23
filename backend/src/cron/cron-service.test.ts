import { CronService, CronTask } from './cron-service';

// Set test env
process.env.NODE_ENV = 'test';

describe('CronService', () => {
    let cron: CronService;

    beforeEach(() => {
        cron = new CronService();
    });

    afterEach(() => {
        cron.stopAll();
    });

    describe('register', () => {
        it('should register a task by name', () => {
            const task: CronTask = {
                name: 'test-task',
                intervalMs: 5000,
                handler: jest.fn(),
            };
            cron.register(task);
            expect(cron.getTaskNames()).toContain('test-task');
        });

        it('should reject duplicate task names', () => {
            const task: CronTask = { name: 'dup', intervalMs: 5000, handler: jest.fn() };
            cron.register(task);
            expect(() => cron.register(task)).toThrow('already registered');
        });
    });

    describe('start / stop', () => {
        it('should start a registered task', () => {
            const handler = jest.fn();
            cron.register({ name: 'starter', intervalMs: 100, handler });
            cron.start('starter');
            expect(cron.isRunning('starter')).toBe(true);
        });

        it('should stop a running task', () => {
            const handler = jest.fn();
            cron.register({ name: 'stopper', intervalMs: 100, handler });
            cron.start('stopper');
            cron.stop('stopper');
            expect(cron.isRunning('stopper')).toBe(false);
        });

        it('should execute handler on interval', async () => {
            const handler = jest.fn();
            cron.register({ name: 'exec', intervalMs: 50, handler });
            cron.start('exec');

            await new Promise((r) => setTimeout(r, 180));
            cron.stop('exec');
            // Should have been called at least 2 times in 180ms with 50ms interval
            expect(handler.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('startAll / stopAll', () => {
        it('should start and stop all registered tasks', () => {
            cron.register({ name: 'a', intervalMs: 100, handler: jest.fn() });
            cron.register({ name: 'b', intervalMs: 100, handler: jest.fn() });
            cron.startAll();
            expect(cron.isRunning('a')).toBe(true);
            expect(cron.isRunning('b')).toBe(true);
            cron.stopAll();
            expect(cron.isRunning('a')).toBe(false);
            expect(cron.isRunning('b')).toBe(false);
        });
    });

    describe('getStatus', () => {
        it('should return status of all tasks', () => {
            cron.register({ name: 'status-test', intervalMs: 100, handler: jest.fn() });
            const statuses = cron.getStatus();
            expect(statuses).toHaveLength(1);
            expect(statuses[0].name).toBe('status-test');
            expect(statuses[0].running).toBe(false);
        });
    });
});
