/**
 * LlmService — Google Gemini adapter.
 *
 * Streams responses via async generator.
 *
 * Configuration (via .env):
 *   LLM_API_KEY  = your Gemini API key
 *   LLM_MODEL    = model name (e.g., gemini-2.5-pro, gemini-2.5-flash)
 */

export interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LlmChunk {
    type: 'text' | 'done';
    content: string;
}

export class LlmService {
    private apiKey: string;
    private model: string;

    constructor(apiKey?: string, model?: string) {
        this.apiKey = apiKey || process.env.LLM_API_KEY || '';
        this.model = model || process.env.LLM_MODEL || 'gemini-2.5-pro';

        if (!this.apiKey) {
            throw new Error('LLM_API_KEY is required. Set it in .env or pass it to the constructor.');
        }
    }

    /**
     * Stream a completion from Google Gemini.
     */
    async *stream(messages: LlmMessage[]): AsyncGenerator<LlmChunk> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

        const body = {
            contents: messages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }],
                })),
            systemInstruction: messages.find(m => m.role === 'system')
                ? { parts: [{ text: messages.find(m => m.role === 'system')!.content }] }
                : undefined,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        if (!response.body) {
            throw new Error('Gemini response has no body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                try {
                    const json = JSON.parse(trimmed.slice(6));
                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        yield { type: 'text', content: text };
                    }
                } catch {
                    // Skip malformed JSON chunks
                }
            }
        }

        yield { type: 'done', content: '' };
    }

    /**
     * Non-streaming completion — returns the full response as a string.
     */
    async complete(messages: LlmMessage[]): Promise<string> {
        const chunks: string[] = [];
        for await (const chunk of this.stream(messages)) {
            if (chunk.type === 'text') chunks.push(chunk.content);
        }
        return chunks.join('');
    }

    /**
     * Check if the LLM service is configured and reachable.
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }
}
