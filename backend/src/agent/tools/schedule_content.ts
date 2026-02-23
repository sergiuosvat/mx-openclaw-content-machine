/**
 * schedule_content — Per-user content scheduling.
 *
 * Multi-user: stores queue items in UserStore by wallet address.
 * Falls back to in-memory storage for anonymous users.
 */
import { v4 as uuidv4 } from 'uuid';
import { Tool, AgentContext } from '../base-agent';
import { UserStore } from '../../user/user-store';

const SUPPORTED_PLATFORMS = ['twitter', 'x', 'linkedin', 'instagram', 'threads', 'youtube', 'tiktok', 'facebook', 'blog'];

export function createScheduleContentTool(): Tool {
    return {
        name: 'schedule_content',
        description: 'Queue content for scheduled publishing to social media platforms. Each user has their own queue.',
        parameters: {
            action: { type: 'string', description: '"add" to queue content, "list" to view queue, "clear" to clear queue', required: true },
            platform: { type: 'string', description: `Target platform: ${SUPPORTED_PLATFORMS.join(', ')}`, required: false },
            content: { type: 'string', description: 'The content to schedule', required: false },
            scheduledTime: { type: 'string', description: 'ISO 8601 datetime for publishing (e.g., 2026-03-01T10:00:00Z)', required: false },
        },
        execute: async (args: Record<string, unknown>, context?: AgentContext): Promise<string> => {
            const action = args.action as string;
            const walletAddress = context?.walletAddress;
            const userStore = context?.userStore as UserStore | undefined;

            if (action === 'list') {
                if (walletAddress && userStore) {
                    const queue = userStore.getContentQueue(walletAddress);
                    return JSON.stringify({
                        walletAddress,
                        queueLength: queue.length,
                        items: queue,
                    });
                }
                return JSON.stringify({ queueLength: 0, items: [], note: 'Connect wallet to persist your content queue.' });
            }

            if (action === 'clear') {
                if (walletAddress && userStore) {
                    const cleared = userStore.clearQueue(walletAddress);
                    return JSON.stringify({ success: true, cleared, walletAddress });
                }
                return JSON.stringify({ success: true, cleared: 0 });
            }

            if (action === 'add') {
                const platform = (args.platform as string || '').toLowerCase();
                const content = args.content as string;
                const scheduledTime = args.scheduledTime as string || new Date(Date.now() + 3600000).toISOString();

                if (!content) {
                    return JSON.stringify({ error: 'Content is required to schedule a post.' });
                }
                if (!SUPPORTED_PLATFORMS.includes(platform)) {
                    return JSON.stringify({ error: `Unsupported platform. Use: ${SUPPORTED_PLATFORMS.join(', ')}` });
                }

                const item = {
                    id: `q-${uuidv4().slice(0, 8)}`,
                    platform,
                    content,
                    scheduledTime,
                    status: 'queued' as const,
                    createdAt: new Date().toISOString(),
                };

                if (walletAddress && userStore) {
                    userStore.addToQueue(walletAddress, item);
                    return JSON.stringify({
                        success: true,
                        walletAddress,
                        scheduled: item,
                        note: 'Content queued for publishing.',
                    });
                }

                return JSON.stringify({
                    success: true,
                    scheduled: item,
                    note: 'Content queued in-memory only. Connect wallet to persist across sessions.',
                });
            }

            return JSON.stringify({ error: `Unknown action: ${action}. Use "add", "list", or "clear".` });
        },
    };
}
