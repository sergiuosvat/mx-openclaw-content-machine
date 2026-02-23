/**
 * monitor_feeds — Scans RSS feeds, Reddit, and web for trending topics.
 * Returns structured trending topics for content ideation.
 */
import axios from 'axios';
import { Tool } from '../base-agent';

interface TrendingTopic {
    title: string;
    source: string;
    url: string;
    summary: string;
    score?: number;
}

/**
 * Minimal RSS XML parser — extracts <item> titles, links, descriptions.
 * No external dependency needed.
 */
function parseRssItems(xml: string): Array<{ title: string; link: string; description: string }> {
    const items: Array<{ title: string; link: string; description: string }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ['', ''])[1]
            .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        const link = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || ['', ''])[1].trim();
        const description = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || ['', ''])[1]
            .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
            .replace(/<[^>]+>/g, '')
            .trim()
            .substring(0, 300);

        if (title) items.push({ title, link, description });
    }

    return items;
}

export function createMonitorFeedsTool(): Tool {
    return {
        name: 'monitor_feeds',
        description: 'Scan RSS feeds, Reddit, and web sources for trending topics and fresh content ideas.',
        parameters: {
            sources: { type: 'array', description: 'Array of RSS feed URLs to scan', required: false },
            subreddits: { type: 'array', description: 'Reddit subreddits to scan (e.g., ["technology", "marketing"])', required: false },
            keywords: { type: 'array', description: 'Keywords to filter topics by relevance', required: false },
            maxResults: { type: 'number', description: 'Max topics to return (default: 10)', required: false },
        },
        execute: async (args: Record<string, unknown>): Promise<string> => {
            const sources = (args.sources as string[]) || [];
            const subreddits = (args.subreddits as string[]) || ['technology', 'marketing'];
            const keywords = (args.keywords as string[]) || [];
            const maxResults = (args.maxResults as number) || 10;

            const topics: TrendingTopic[] = [];

            // 1. Scan RSS feeds
            for (const feedUrl of sources.slice(0, 5)) {
                try {
                    const resp = await axios.get(feedUrl, {
                        timeout: 10000,
                        headers: { 'User-Agent': 'ContentMachine/1.0' },
                        responseType: 'text',
                    });
                    const items = parseRssItems(resp.data as string);
                    for (const item of items.slice(0, 5)) {
                        topics.push({
                            title: item.title,
                            source: `RSS: ${feedUrl}`,
                            url: item.link,
                            summary: item.description,
                        });
                    }
                } catch {
                    // Skip failed feeds silently
                }
            }

            // 2. Scan Reddit (JSON API — no auth needed)
            for (const sub of subreddits.slice(0, 3)) {
                try {
                    const resp = await axios.get(`https://www.reddit.com/r/${encodeURIComponent(sub)}/hot.json?limit=5`, {
                        timeout: 10000,
                        headers: { 'User-Agent': 'ContentMachine/1.0' },
                    });
                    const posts = (resp.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
                    const children = (posts?.children as Array<Record<string, unknown>>) || [];
                    for (const child of children) {
                        const post = child.data as Record<string, string | number>;
                        topics.push({
                            title: post.title as string,
                            source: `Reddit: r/${sub}`,
                            url: `https://reddit.com${post.permalink}`,
                            summary: ((post.selftext as string) || '').substring(0, 300),
                            score: post.score as number,
                        });
                    }
                } catch {
                    // Skip failed subreddits silently
                }
            }

            // 3. If no external sources worked, return guidance
            if (topics.length === 0) {
                return JSON.stringify({
                    topics: [{
                        title: 'Configure feed sources for live monitoring',
                        source: 'system',
                        url: '',
                        summary: 'Add RSS feed URLs or subreddit names to monitor_feeds to get live trending topics.',
                    }],
                    note: 'No live feeds scanned. Provide RSS URLs or subreddit names.',
                });
            }

            // 4. Filter by keywords if provided
            let filtered = topics;
            if (keywords.length > 0) {
                const lowerKeywords = keywords.map(k => k.toLowerCase());
                filtered = topics.filter(t =>
                    lowerKeywords.some(kw =>
                        t.title.toLowerCase().includes(kw) || t.summary.toLowerCase().includes(kw),
                    ),
                );
                if (filtered.length === 0) filtered = topics; // fallback to unfiltered
            }

            return JSON.stringify({
                topics: filtered.slice(0, maxResults),
                totalScanned: topics.length,
                sourcesChecked: sources.length + subreddits.length,
            });
        },
    };
}
