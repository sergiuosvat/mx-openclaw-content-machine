import { MarketResearchAgent } from './market-research-agent';
import { createSearchWebTool } from './tools/search_web';
import { createScrapePageTool } from './tools/scrape_page';
import { createReadFileTool } from './tools/read_file';
import { createGenerateReportTool } from './tools/generate_report';

describe('MarketResearchAgent', () => {
    let agent: MarketResearchAgent;

    beforeEach(() => {
        agent = new MarketResearchAgent();
    });

    it('should have 4 tools', () => {
        expect(agent.getTools()).toHaveLength(4);
    });

    it('should have the correct tool names', () => {
        const names = agent.getTools().map(t => t.name);
        expect(names).toContain('search_web');
        expect(names).toContain('scrape_page');
        expect(names).toContain('read_file');
        expect(names).toContain('generate_report');
    });

    it('should return a system prompt mentioning research', () => {
        const prompt = agent.getSystemPrompt();
        expect(prompt).toContain('market research');
        expect(prompt.length).toBeGreaterThan(100);
    });

    it('should inherit execute from BaseAgent and yield events', async () => {
        const events = [];
        for await (const event of agent.execute('Research crypto', {
            sessionId: 'test', fileIds: [], previousMessages: [],
        })) {
            events.push(event);
        }
        expect(events.length).toBeGreaterThanOrEqual(3);
        expect(events[0].type).toBe('thinking');
        expect(events[events.length - 1].type).toBe('complete');
    });

    it('should return metadata with tools listed', () => {
        const meta = agent.getMetadata();
        expect((meta.tools as Array<{ name: string }>).length).toBe(4);
    });
});

describe('Tool: search_web', () => {
    it('should return fallback when no API key is configured', async () => {
        const tool = createSearchWebTool();
        const result = await tool.execute({ query: 'AI trends' });
        const parsed = JSON.parse(result);
        expect(parsed.note || parsed.results).toBeDefined();
    });

    it('should return error for empty query', async () => {
        const tool = createSearchWebTool();
        const result = await tool.execute({ query: '' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });
});

describe('Tool: scrape_page', () => {
    it('should return error for invalid URL', async () => {
        const tool = createScrapePageTool();
        const result = await tool.execute({ url: 'not-a-url' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });
});

describe('Tool: read_file', () => {
    it('should return error for missing filePath', async () => {
        const tool = createReadFileTool();
        const result = await tool.execute({});
        const parsed = JSON.parse(result);
        expect(parsed.error).toBeDefined();
    });

    it('should prevent path traversal', async () => {
        const tool = createReadFileTool();
        const result = await tool.execute({ filePath: '../../../etc/passwd' });
        const parsed = JSON.parse(result);
        expect(parsed.error).toContain('Access denied');
    });
});

describe('Tool: generate_report', () => {
    it('should generate a markdown report', async () => {
        const tool = createGenerateReportTool();
        const result = await tool.execute({
            title: 'AI Market Analysis',
            sections: [
                { heading: 'Overview', content: 'AI market is growing.' },
                { heading: 'Key Players', content: 'OpenAI, Google, Anthropic.' },
            ],
            summary: 'The AI market is booming.',
        });
        const parsed = JSON.parse(result);
        expect(parsed.title).toBe('AI Market Analysis');
        expect(parsed.sectionCount).toBe(2);
        expect(parsed.markdown).toContain('## Overview');
        expect(parsed.markdown).toContain('## Key Players');
        expect(parsed.markdown).toContain('Executive Summary');
        expect(parsed.wordCount).toBeGreaterThan(10);
    });

    it('should handle empty sections', async () => {
        const tool = createGenerateReportTool();
        const result = await tool.execute({ title: 'Empty Report', sections: [] });
        const parsed = JSON.parse(result);
        expect(parsed.sectionCount).toBe(0);
        expect(parsed.markdown).toContain('# Empty Report');
    });
});
