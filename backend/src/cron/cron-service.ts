/**
 * CronService — lightweight task scheduler for proactive agent operations.
 *
 * Handles: gas monitoring, settlement checks, session cleanup, health reporting.
 */

export interface CronTask {
    name: string;
    intervalMs: number;
    handler: () => void | Promise<void>;
}

interface RunningTask {
    task: CronTask;
    timer: ReturnType<typeof setInterval> | null;
    lastRun: number | null;
    runCount: number;
}

export class CronService {
    private tasks: Map<string, RunningTask> = new Map();

    register(task: CronTask): void {
        if (this.tasks.has(task.name)) {
            throw new Error(`Task "${task.name}" already registered`);
        }
        this.tasks.set(task.name, {
            task,
            timer: null,
            lastRun: null,
            runCount: 0,
        });
    }

    start(name: string): void {
        const entry = this.tasks.get(name);
        if (!entry) throw new Error(`Task "${name}" not found`);
        if (entry.timer) return; // Already running

        entry.timer = setInterval(async () => {
            try {
                await entry.task.handler();
                entry.lastRun = Date.now();
                entry.runCount++;
            } catch (err) {
                console.error(`[cron] Task "${name}" failed:`, err);
            }
        }, entry.task.intervalMs);
    }

    stop(name: string): void {
        const entry = this.tasks.get(name);
        if (!entry) throw new Error(`Task "${name}" not found`);
        if (entry.timer) {
            clearInterval(entry.timer);
            entry.timer = null;
        }
    }

    startAll(): void {
        for (const name of this.tasks.keys()) {
            this.start(name);
        }
    }

    stopAll(): void {
        for (const name of this.tasks.keys()) {
            this.stop(name);
        }
    }

    isRunning(name: string): boolean {
        const entry = this.tasks.get(name);
        return entry ? entry.timer !== null : false;
    }

    getTaskNames(): string[] {
        return Array.from(this.tasks.keys());
    }

    getStatus(): Array<{ name: string; running: boolean; lastRun: number | null; runCount: number }> {
        return Array.from(this.tasks.values()).map((entry) => ({
            name: entry.task.name,
            running: entry.timer !== null,
            lastRun: entry.lastRun,
            runCount: entry.runCount,
        }));
    }
}
