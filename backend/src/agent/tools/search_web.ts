/**
 * search_web — Searches the web using a search API (Tavily, Serper, or Google).
 * Returns structured search results for the agent to synthesize.
 */
import axios from 'axios';
import { Tool } from '../base-agent';

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export function createSearchWebTool(): Tool {
    return {
        name: 'search_web',
        description: 'Search the web for information on a topic. Returns titles, URLs, and snippets.',
        parameters: {
            query: { type: 'string', description: 'The search query', required: true },
            maxResults: { type: 'number', description: 'Max results to return (default: 5)', required: false },
        },
        execute: async (args: Record<string, unknown>): Promise<string> => {
            const query = args.query as string;
            const maxResults = (args.maxResults as number) || 5;

            if (!query || query.trim().length === 0) {
                return JSON.stringify({ error: 'Query is required' });
            }

            const apiKey = process.env.SEARCH_API_KEY || process.env.TAVILY_API_KEY;
            if (!apiKey) {
                // Fallback: return a placeholder indicating config needed
                return JSON.stringify({
                    results: [{
                        title: `Search results for: ${query}`,
                        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                        snippet: 'Configure SEARCH_API_KEY or TAVILY_API_KEY in .env to enable live search.',
                    }],
                    note: 'Search API not configured. Set SEARCH_API_KEY in .env.',
                });
            }

            try {
                // Tavily API
                const response = await axios.post('https://api.tavily.com/search', {
                    api_key: apiKey,
                    query,
                    max_results: maxResults,
                    include_answer: true,
                }, { timeout: 15000 });

                const results: SearchResult[] = (response.data.results || []).map((r: Record<string, string>) => ({
                    title: r.title,
                    url: r.url,
                    snippet: r.content?.substring(0, 300) || '',
                }));

                return JSON.stringify({
                    answer: response.data.answer || '',
                    results,
                    query,
                });
            } catch (err) {
                return JSON.stringify({ error: `Search failed: ${(err as Error).message}`, query });
            }
        },
    };
}
