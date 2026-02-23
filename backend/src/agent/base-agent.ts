/**
 * BaseAgent — Abstract agent interface for the mx-openclaw-template-solution.
 *
 * Derivatives (like mx-openclaw-market-research) extend this class and provide:
 * 1. Their own tools (search, scrape, analyze, etc.)
 * 2. Their own system prompt
 *
 * The base template handles the chat server, payment gating, and streaming.
 * The agent only needs to know how to process a prompt and yield results.
 */

import { LlmService, LlmMessage } from '../llm/llm-service';

export interface Tool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>, context?: AgentContext) => Promise<string>;
}

export interface StreamEvent {
    type: 'thinking' | 'text' | 'tool_call' | 'tool_result' | 'complete' | 'error';
    content: string;
    toolName?: string;
    jobId?: string;
}

export interface AgentContext {
    sessionId: string;
    fileIds: string[];
    previousMessages: Array<{ role: string; content: string }>;
    walletAddress?: string;
    userStore?: unknown; // UserStore instance — typed as unknown to avoid circular deps
}

export abstract class BaseAgent {
    protected llm: LlmService | null = null;

    constructor() {
        // Only create LlmService if API key is available (not in test mode)
        try {
            this.llm = new LlmService();
        } catch {
            // LLM_API_KEY not set — agent will use placeholder responses
            this.llm = null;
        }
    }

    /**
     * Return the list of tools this agent can use.
     * Override in derivatives to add domain-specific tools.
     */
    abstract getTools(): Tool[];

    /**
     * Return the system prompt for this agent.
     * Override in derivatives to customize behavior.
     */
    abstract getSystemPrompt(): string;

    /**
     * Execute a prompt and yield streaming events.
     * If LLM_API_KEY is set, calls the real LLM.
     * If not, returns a helpful placeholder.
     */
    async *execute(prompt: string, context: AgentContext): AsyncGenerator<StreamEvent> {
        const jobId = `job-${context.sessionId}`;

        yield { type: 'thinking', content: 'Processing your request...' };

        if (!this.llm) {
            yield {
                type: 'text',
                content: `⚠️ LLM_API_KEY is not configured. Set it in .env to enable real responses.\n\nReceived: "${prompt}"`,
            };
            yield { type: 'complete', content: 'Done (no LLM configured)', jobId };
            return;
        }

        try {
            // Build message history
            const messages: LlmMessage[] = [
                { role: 'system', content: this.getSystemPrompt() },
            ];

            // Add previous conversation context
            for (const msg of context.previousMessages) {
                messages.push({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                });
            }

            // Add current prompt
            messages.push({ role: 'user', content: prompt });

            // Stream from LLM
            for await (const chunk of this.llm.stream(messages)) {
                if (chunk.type === 'text') {
                    yield { type: 'text', content: chunk.content };
                }
            }

            yield { type: 'complete', content: 'Done', jobId };
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            yield { type: 'error', content: `LLM error: ${errorMessage}` };
            yield { type: 'complete', content: 'Done (with errors)', jobId };
        }
    }

    /**
     * Get agent metadata for the /api/agent endpoint.
     */
    getMetadata(): Record<string, unknown> {
        return {
            tools: this.getTools().map(t => ({ name: t.name, description: t.description })),
            systemPromptLength: this.getSystemPrompt().length,
            llmConfigured: this.llm !== null,
        };
    }
}

/**
 * Default agent — used when no derivative is configured.
 * Works with any LLM via LLM_API_KEY.
 */
export class DefaultAgent extends BaseAgent {
    getTools(): Tool[] {
        return [];
    }

    getSystemPrompt(): string {
        return `You are a helpful AI assistant powered by MultiversX.
You answer questions clearly and concisely.
If the user uploads files, analyze their content.
Always be accurate — if you're unsure, say so.`;
    }
}
