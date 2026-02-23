/**
 * scrape_page — Fetches a URL and extracts clean text content.
 * Strips HTML tags and returns readable text for the agent to analyze.
 */
import axios from 'axios';
import { Tool } from '../base-agent';

export function createScrapePageTool(): Tool {
    return {
        name: 'scrape_page',
        description: 'Fetch a web page and extract its text content. Useful for reading articles and documentation.',
        parameters: {
            url: { type: 'string', description: 'The URL to scrape', required: true },
            maxLength: { type: 'number', description: 'Max characters to return (default: 5000)', required: false },
        },
        execute: async (args: Record<string, unknown>): Promise<string> => {
            const url = args.url as string;
            const maxLength = (args.maxLength as number) || 5000;

            if (!url || !url.startsWith('http')) {
                return JSON.stringify({ error: 'Valid URL starting with http(s) is required' });
            }

            try {
                const response = await axios.get(url, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; OpenClawBot/1.0)',
                        'Accept': 'text/html,application/xhtml+xml,text/plain',
                    },
                    maxRedirects: 3,
                    responseType: 'text',
                });

                const html = response.data as string;

                // Simple HTML to text extraction
                const text = html
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // Remove styles
                    .replace(/<[^>]+>/g, ' ')                          // Remove tags
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/\s+/g, ' ')                              // Collapse whitespace
                    .trim()
                    .substring(0, maxLength);

                return JSON.stringify({
                    url,
                    title: (html.match(/<title[^>]*>(.*?)<\/title>/i) || ['', 'No title'])[1],
                    content: text,
                    length: text.length,
                });
            } catch (err) {
                return JSON.stringify({ error: `Scrape failed: ${(err as Error).message}`, url });
            }
        },
    };
}
