import { BaseAgent, DefaultAgent, StreamEvent } from './base-agent';

describe('BaseAgent', () => {
    describe('DefaultAgent', () => {
        let agent: DefaultAgent;

        beforeEach(() => {
            agent = new DefaultAgent();
        });

        it('should return empty tools array', () => {
            expect(agent.getTools()).toEqual([]);
        });

        it('should return a non-empty system prompt', () => {
            const prompt = agent.getSystemPrompt();
            expect(prompt.length).toBeGreaterThan(0);
        });

        it('should yield thinking, text, and complete events', async () => {
            const events: StreamEvent[] = [];
            for await (const event of agent.execute('Hello', {
                sessionId: 'test-session',
                fileIds: [],
                previousMessages: [],
            })) {
                events.push(event);
            }

            expect(events.length).toBe(3);
            expect(events[0].type).toBe('thinking');
            expect(events[1].type).toBe('text');
            expect(events[2].type).toBe('complete');
        });

        it('should include the user prompt in the text response', async () => {
            const events: StreamEvent[] = [];
            for await (const event of agent.execute('Research AI', {
                sessionId: 'test',
                fileIds: [],
                previousMessages: [],
            })) {
                events.push(event);
            }

            const textEvent = events.find(e => e.type === 'text');
            expect(textEvent!.content).toContain('Research AI');
        });

        it('should return metadata with tools and systemPromptLength', () => {
            const metadata = agent.getMetadata();
            expect(metadata.tools).toEqual([]);
            expect(typeof metadata.systemPromptLength).toBe('number');
            expect(metadata.systemPromptLength).toBeGreaterThan(0);
        });
    });

    describe('Custom Agent (extending BaseAgent)', () => {
        class TestAgent extends BaseAgent {
            getTools() {
                return [
                    {
                        name: 'test_tool',
                        description: 'A test tool',
                        parameters: { query: { type: 'string' } },
                        execute: async (args: Record<string, unknown>) => `Result for ${args.query}`,
                    },
                ];
            }

            getSystemPrompt() {
                return 'You are a test agent.';
            }
        }

        it('should return custom tools', () => {
            const agent = new TestAgent();
            expect(agent.getTools()).toHaveLength(1);
            expect(agent.getTools()[0].name).toBe('test_tool');
        });

        it('should return custom system prompt', () => {
            const agent = new TestAgent();
            expect(agent.getSystemPrompt()).toBe('You are a test agent.');
        });

        it('should execute tools', async () => {
            const agent = new TestAgent();
            const tool = agent.getTools()[0];
            const result = await tool.execute({ query: 'hello' });
            expect(result).toBe('Result for hello');
        });
    });
});
