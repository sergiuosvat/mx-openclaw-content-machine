/**
 * content_calendar — Per-user weekly content calendar.
 *
 * Multi-user: stores calendars in UserStore by wallet address.
 * Falls back to generated-only (no persistence) for anonymous users.
 */
import { Tool, AgentContext } from '../base-agent';
import { UserStore } from '../../user/user-store';

const PLATFORMS = ['x', 'linkedin', 'instagram', 'threads', 'youtube', 'blog'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function createContentCalendarTool(): Tool {
    return {
        name: 'content_calendar',
        description: 'Generate, view, or save a weekly content calendar. Each user has their own calendar.',
        parameters: {
            action: { type: 'string', description: '"generate" to create a new calendar, "view" to see existing, "save" to persist', required: true },
            weekStart: { type: 'string', description: 'Start date of the week (YYYY-MM-DD). Defaults to next Monday.', required: false },
            platforms: { type: 'string', description: 'Comma-separated platforms to include (default: x,linkedin,instagram)', required: false },
            postsPerDay: { type: 'number', description: 'Number of posts per day (default: 2)', required: false },
            contentPillars: { type: 'string', description: 'Comma-separated content themes', required: false },
            calendar: { type: 'object', description: 'Calendar data to save (only when action=save)', required: false },
        },
        execute: async (args: Record<string, unknown>, context?: AgentContext): Promise<string> => {
            const action = args.action as string;
            const walletAddress = context?.walletAddress;
            const userStore = context?.userStore as UserStore | undefined;

            // Calculate default week start (next Monday)
            const now = new Date();
            const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
            const nextMonday = new Date(now);
            nextMonday.setDate(now.getDate() + daysUntilMonday);
            const defaultWeekStart = nextMonday.toISOString().slice(0, 10);
            const weekStart = (args.weekStart as string) || defaultWeekStart;

            if (action === 'view') {
                if (walletAddress && userStore) {
                    const calendar = userStore.getCalendar(walletAddress, weekStart);
                    if (calendar.length > 0) {
                        return JSON.stringify({
                            walletAddress,
                            weekStart,
                            calendar,
                        });
                    }
                }
                return JSON.stringify({
                    weekStart,
                    calendar: [],
                    note: 'No calendar found for this week. Use action="generate" to create one.',
                });
            }

            if (action === 'save' && args.calendar) {
                if (walletAddress && userStore) {
                    userStore.saveCalendar(walletAddress, weekStart, args.calendar as unknown[]);
                    return JSON.stringify({
                        success: true,
                        walletAddress,
                        weekStart,
                        note: 'Calendar saved. View it anytime with action="view".',
                    });
                }
                return JSON.stringify({
                    success: false,
                    note: 'Connect wallet to persist your content calendar.',
                });
            }

            if (action === 'generate') {
                const selectedPlatforms = ((args.platforms as string) || 'x,linkedin,instagram')
                    .split(',')
                    .map(p => p.trim().toLowerCase())
                    .filter(p => PLATFORMS.includes(p));

                const postsPerDay = Math.min(Math.max(Number(args.postsPerDay) || 2, 1), 5);
                const pillars = ((args.contentPillars as string) || 'Industry insights,How-to guides,Case studies')
                    .split(',')
                    .map(p => p.trim());

                const calendar = DAYS.map((day, i) => ({
                    day,
                    date: (() => {
                        const d = new Date(weekStart);
                        d.setDate(d.getDate() + i);
                        return d.toISOString().slice(0, 10);
                    })(),
                    posts: Array.from({ length: postsPerDay }, (_, j) => ({
                        slot: j + 1,
                        platform: selectedPlatforms[j % selectedPlatforms.length],
                        contentPillar: pillars[(i * postsPerDay + j) % pillars.length],
                        suggestedTopic: `[AI will generate topic based on ${pillars[(i * postsPerDay + j) % pillars.length]} pillar]`,
                        optimalTime: j === 0 ? '09:00' : j === 1 ? '14:00' : '18:00',
                        status: 'planned',
                    })),
                }));

                // Auto-save if user is authenticated
                if (walletAddress && userStore) {
                    userStore.saveCalendar(walletAddress, weekStart, calendar);
                }

                return JSON.stringify({
                    weekStart,
                    walletAddress: walletAddress || 'anonymous',
                    calendar,
                    totalPosts: DAYS.length * postsPerDay,
                    platforms: selectedPlatforms,
                    savedToProfile: !!walletAddress,
                    note: 'Calendar generated. Each topic placeholder should be replaced with actual topics based on trending feeds and brand voice.',
                });
            }

            return JSON.stringify({
                error: `Unknown action: ${action}. Use "generate", "view", or "save".`,
            });
        },
    };
}
