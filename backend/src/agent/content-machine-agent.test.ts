import { ContentMachineAgent } from './content-machine-agent';
import { createMonitorFeedsTool } from './tools/monitor_feeds';
import { createAnalyzeBrandVoiceTool } from './tools/analyze_brand_voice';
import { createGenerateShortContentTool } from './tools/generate_short_content';
import { createGenerateLongContentTool } from './tools/generate_long_content';
import { createGenerateVideoScriptTool } from './tools/generate_video_script';
import { createGenerateThumbnailTool } from './tools/generate_thumbnail';
import { createScheduleContentTool } from './tools/schedule_content';
import { createContentCalendarTool } from './tools/content_calendar';
import { UserStore } from '../user/user-store';
import path from 'path';
import fs from 'fs';

// Test UserStore for per-user tool tests
const TEST_DB = path.resolve(__dirname, 'test-tools.db');
const TEST_WALLET = 'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3';

let testUserStore: UserStore;

beforeEach(() => {
    testUserStore = new UserStore(TEST_DB);
    testUserStore.getOrCreateUser(TEST_WALLET);
});

afterEach(() => {
    testUserStore.close();
    try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
    try { fs.unlinkSync(TEST_DB + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(TEST_DB + '-shm'); } catch { /* ignore */ }
});

describe('ContentMachineAgent', () => {
    let agent: ContentMachineAgent;

    beforeEach(() => {
        agent = new ContentMachineAgent();
    });

    it('should have 10 tools', () => {
        expect(agent.getTools()).toHaveLength(10);
    });

    it('should have the correct tool names', () => {
        const names = agent.getTools().map(t => t.name);
        expect(names).toContain('monitor_feeds');
        expect(names).toContain('analyze_brand_voice');
        expect(names).toContain('search_web');
        expect(names).toContain('scrape_page');
        expect(names).toContain('generate_short_content');
        expect(names).toContain('generate_long_content');
        expect(names).toContain('generate_video_script');
        expect(names).toContain('generate_thumbnail');
        expect(names).toContain('schedule_content');
        expect(names).toContain('content_calendar');
    });

    it('should return a system prompt mentioning content and brand voice', () => {
        const prompt = agent.getSystemPrompt();
        expect(prompt).toContain('Content Machine');
        expect(prompt).toContain('brand voice');
        expect(prompt.length).toBeGreaterThan(200);
    });

    it('should inherit execute from BaseAgent and yield events', async () => {
        const events = [];
        for await (const event of agent.execute('Write a tweet about AI', {
            sessionId: 'test', fileIds: [], previousMessages: [],
        })) {
            events.push(event);
        }
        expect(events.length).toBeGreaterThanOrEqual(3);
        expect(events[0].type).toBe('thinking');
        expect(events[events.length - 1].type).toBe('complete');
    });

    it('should return metadata with all tools listed', () => {
        const meta = agent.getMetadata();
        expect((meta.tools as Array<{ name: string }>).length).toBe(10);
    });
});

describe('Tool: monitor_feeds', () => {
    it('should return guidance when no sources are provided', async () => {
        const tool = createMonitorFeedsTool();
        const result = await tool.execute({ sources: [], subreddits: [] });
        const parsed = JSON.parse(result);
        expect(parsed.topics).toBeDefined();
        expect(parsed.note).toContain('No live feeds');
    });

    it('should handle keywords filtering', async () => {
        const tool = createMonitorFeedsTool();
        const result = await tool.execute({ sources: [], subreddits: [], keywords: ['nonexistent'] });
        const parsed = JSON.parse(result);
        expect(parsed.topics).toBeDefined();
    });
});

describe('Tool: analyze_brand_voice', () => {
    it('should return default profile when no file exists', async () => {
        const tool = createAnalyzeBrandVoiceTool();
        const result = await tool.execute({});
        const parsed = JSON.parse(result);
        expect(parsed.source).toBe('default');
        expect(parsed.profile.tone).toBeDefined();
        expect(parsed.profile.vocabulary).toBeDefined();
        expect(parsed.profile.doList).toBeDefined();
        expect(parsed.profile.dontList).toBeDefined();
        expect(parsed.profile.examplePosts).toBeDefined();
    });

    it('should load saved profile from UserStore', async () => {
        const tool = createAnalyzeBrandVoiceTool();
        // Save a custom profile via UserStore
        testUserStore.saveBrandVoice(TEST_WALLET, {
            tone: 'Casual', vocabulary: ['awesome'], doList: [], dontList: [],
            examplePosts: [], hashtagStrategy: '', targetAudience: '', contentPillars: [],
        });

        const result = await tool.execute({}, {
            sessionId: 'test', fileIds: [], previousMessages: [],
            walletAddress: TEST_WALLET, userStore: testUserStore,
        });
        const parsed = JSON.parse(result);
        expect(parsed.source).toBe('user-profile');
        expect(parsed.profile.tone).toBe('Casual');
    });
});

describe('Tool: generate_short_content', () => {
    it('should return error for empty topic', async () => {
        const tool = createGenerateShortContentTool();
        const result = await tool.execute({ topic: '', platform: 'twitter' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });

    it('should return platform guidelines when no content is provided', async () => {
        const tool = createGenerateShortContentTool();
        const result = await tool.execute({ topic: 'AI trends', platform: 'linkedin' });
        const parsed = JSON.parse(result);
        expect(parsed.platform).toBe('linkedin');
        expect(parsed.maxLength).toBe(3000);
        expect(parsed.instruction).toBeDefined();
    });

    it('should format provided content with character count', async () => {
        const tool = createGenerateShortContentTool();
        const result = await tool.execute({
            topic: 'AI trends',
            platform: 'twitter',
            content: 'AI is changing everything.',
            hashtags: ['AI', 'tech'],
        });
        const parsed = JSON.parse(result);
        expect(parsed.characterCount).toBeGreaterThan(0);
        expect(parsed.withinLimit).toBe(true);
        expect(parsed.content).toContain('#AI');
    });

    it('should detect when content exceeds platform limit', async () => {
        const tool = createGenerateShortContentTool();
        const longContent = 'A'.repeat(300);
        const result = await tool.execute({
            topic: 'test',
            platform: 'twitter',
            content: longContent,
        });
        const parsed = JSON.parse(result);
        expect(parsed.truncated).toBe(true);
    });
});

describe('Tool: generate_long_content', () => {
    it('should return error for empty topic', async () => {
        const tool = createGenerateLongContentTool();
        const result = await tool.execute({ topic: '' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });

    it('should return structured brief when no sections provided', async () => {
        const tool = createGenerateLongContentTool();
        const result = await tool.execute({ topic: 'How to Build an AI Agent', format: 'blog' });
        const parsed = JSON.parse(result);
        expect(parsed.outline).toBeDefined();
        expect(parsed.outline.length).toBeGreaterThan(0);
        expect(parsed.instruction).toBeDefined();
    });

    it('should compile sections into markdown with SEO metadata', async () => {
        const tool = createGenerateLongContentTool();
        const result = await tool.execute({
            topic: 'AI Agents 101',
            sections: [
                { heading: 'Introduction', content: 'AI agents are autonomous systems.' },
                { heading: 'How They Work', content: 'They use LLMs to process tasks.' },
            ],
            metaDescription: 'A comprehensive guide to AI agents.',
        });
        const parsed = JSON.parse(result);
        expect(parsed.markdown).toContain('# AI Agents 101');
        expect(parsed.markdown).toContain('## Introduction');
        expect(parsed.markdown).toContain('## How They Work');
        expect(parsed.sectionCount).toBe(2);
        expect(parsed.seo.metaDescription).toContain('comprehensive guide');
    });
});

describe('Tool: generate_video_script', () => {
    it('should return error for empty topic', async () => {
        const tool = createGenerateVideoScriptTool();
        const result = await tool.execute({ topic: '' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });

    it('should return script template when no sections provided', async () => {
        const tool = createGenerateVideoScriptTool();
        const result = await tool.execute({ topic: 'Building AI Agents', duration: 10 });
        const parsed = JSON.parse(result);
        expect(parsed.template).toBeDefined();
        expect(parsed.template.length).toBeGreaterThan(0);
        expect(parsed.template[0].section).toBe('HOOK');
    });

    it('should compile sections into a formatted script', async () => {
        const tool = createGenerateVideoScriptTool();
        const result = await tool.execute({
            topic: 'AI 101',
            sections: [
                { timestamp: '0:00', section: 'HOOK', content: 'What if your computer could think?', speakerNotes: 'Lean in, eye contact.' },
                { timestamp: '0:15', section: 'INTRO', content: 'Welcome to AI 101.' },
            ],
        });
        const parsed = JSON.parse(result);
        expect(parsed.script).toContain('HOOK');
        expect(parsed.script).toContain('Speaker Notes');
        expect(parsed.sectionCount).toBe(2);
        expect(parsed.wordCount).toBeGreaterThan(10);
    });
});

describe('Tool: generate_thumbnail', () => {
    it('should return error for empty topic', async () => {
        const tool = createGenerateThumbnailTool();
        const result = await tool.execute({ topic: '' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });

    it('should return prompt and dimensions for YouTube', async () => {
        const tool = createGenerateThumbnailTool();
        const result = await tool.execute({ topic: 'AI Revolution', platform: 'youtube' });
        const parsed = JSON.parse(result);
        expect(parsed.platform).toBe('youtube');
        expect(parsed.dimensions.width).toBe(1280);
        expect(parsed.dimensions.height).toBe(720);
        expect(parsed.prompt).toContain('AI Revolution');
        expect(parsed.generated).toBe(false);
    });

    it('should return square dimensions for Instagram posts', async () => {
        const tool = createGenerateThumbnailTool();
        const result = await tool.execute({ topic: 'Cool graphic', platform: 'instagram_post' });
        const parsed = JSON.parse(result);
        expect(parsed.dimensions.width).toBe(1080);
        expect(parsed.dimensions.height).toBe(1080);
        expect(parsed.dimensions.aspectRatio).toBe('1:1');
    });
});

describe('Tool: schedule_content', () => {
    const ctx = () => ({
        sessionId: 'test', fileIds: [], previousMessages: [],
        walletAddress: TEST_WALLET, userStore: testUserStore,
    });

    it('should return empty list when no items queued', async () => {
        const tool = createScheduleContentTool();
        const result = await tool.execute({ action: 'list' }, ctx());
        const parsed = JSON.parse(result);
        expect(parsed.queueLength).toBe(0);
    });

    it('should queue content and return confirmation', async () => {
        const tool = createScheduleContentTool();
        const result = await tool.execute({
            action: 'add',
            platform: 'twitter',
            content: 'AI is amazing!',
            scheduledTime: '2026-03-01T10:00:00Z',
        }, ctx());
        const parsed = JSON.parse(result);
        expect(parsed.scheduled.platform).toBe('twitter');
        expect(parsed.scheduled.status).toBe('queued');
        expect(parsed.success).toBe(true);
    });

    it('should require content for queueing', async () => {
        const tool = createScheduleContentTool();
        const result = await tool.execute({ action: 'add', platform: 'twitter' }, ctx());
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });

    it('should clear the queue', async () => {
        const tool = createScheduleContentTool();
        await tool.execute({ action: 'add', platform: 'twitter', content: 'Test' }, ctx());
        const clearResult = await tool.execute({ action: 'clear' }, ctx());
        const parsed = JSON.parse(clearResult);
        expect(parsed.success).toBe(true);

        const listResult = await tool.execute({ action: 'list' }, ctx());
        const listParsed = JSON.parse(listResult);
        expect(listParsed.queueLength).toBe(0);
    });
});

describe('Tool: content_calendar', () => {
    const ctx = () => ({
        sessionId: 'test', fileIds: [], previousMessages: [],
        walletAddress: TEST_WALLET, userStore: testUserStore,
    });

    it('should return empty when no calendar exists', async () => {
        const tool = createContentCalendarTool();
        const result = await tool.execute({ action: 'view' }, ctx());
        const parsed = JSON.parse(result);
        expect(parsed.calendar).toEqual([]);
    });

    it('should generate a 7-day calendar', async () => {
        const tool = createContentCalendarTool();
        const result = await tool.execute({
            action: 'generate',
            weekStart: '2026-03-02',
            platforms: 'x,linkedin',
        }, ctx());
        const parsed = JSON.parse(result);
        expect(parsed.savedToProfile).toBe(true);
        expect(parsed.calendar).toHaveLength(7);
        expect(parsed.calendar[0].posts.length).toBeGreaterThan(0);
    });

    it('should save and retrieve calendar', async () => {
        const tool = createContentCalendarTool();
        await tool.execute({
            action: 'generate',
            weekStart: '2026-03-02',
        }, ctx());

        const viewResult = await tool.execute({ action: 'view', weekStart: '2026-03-02' }, ctx());
        const parsed = JSON.parse(viewResult);
        expect(parsed.calendar.length).toBe(7);
    });

    it('should handle unknown action', async () => {
        const tool = createContentCalendarTool();
        const result = await tool.execute({ action: 'delete' }, ctx());
        const parsed = JSON.parse(result);
        expect(parsed.error).toContain('Unknown action');
    });
});
