/**
 * generate_short_content — Formats and structures social media posts.
 * Handles platform-specific constraints (character limits, hashtag strategies).
 */
import { Tool } from '../base-agent';

interface PlatformConfig {
    maxLength: number;
    hashtagLimit: number;
    format: string;
}

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
    twitter: { maxLength: 280, hashtagLimit: 3, format: 'Short, punchy. Thread-friendly. Hook in first line.' },
    x: { maxLength: 280, hashtagLimit: 3, format: 'Short, punchy. Thread-friendly. Hook in first line.' },
    linkedin: { maxLength: 3000, hashtagLimit: 5, format: 'Professional storytelling. Whitespace between lines. End with question or CTA.' },
    instagram: { maxLength: 2200, hashtagLimit: 30, format: 'Visual storytelling. Emoji-friendly. Hashtags at end or in first comment.' },
    threads: { maxLength: 500, hashtagLimit: 5, format: 'Conversational. Authentic. No heavy formatting.' },
};

export function createGenerateShortContentTool(): Tool {
    return {
        name: 'generate_short_content',
        description: 'Generate platform-optimized social media posts (X/Twitter, LinkedIn, Instagram, Threads). Returns formatted content with character counts.',
        parameters: {
            topic: { type: 'string', description: 'The topic or idea for the post', required: true },
            platform: { type: 'string', description: 'Target platform: twitter/x, linkedin, instagram, threads', required: true },
            tone: { type: 'string', description: 'Tone override (e.g., "casual", "professional", "provocative")', required: false },
            hashtags: { type: 'array', description: 'Specific hashtags to include', required: false },
            content: { type: 'string', description: 'The actual post content (if already drafted by LLM)', required: false },
        },
        execute: async (args: Record<string, unknown>): Promise<string> => {
            const topic = args.topic as string;
            const platform = ((args.platform as string) || 'twitter').toLowerCase();
            const tone = (args.tone as string) || 'default';
            const hashtags = (args.hashtags as string[]) || [];
            const content = args.content as string | undefined;

            if (!topic || topic.trim().length === 0) {
                return JSON.stringify({ error: 'Topic is required' });
            }

            const config = PLATFORM_CONFIGS[platform] || PLATFORM_CONFIGS.twitter;

            // If content is provided (LLM already drafted), validate and format it
            if (content) {
                const hashtagSuffix = hashtags.length > 0
                    ? '\n\n' + hashtags.slice(0, config.hashtagLimit).map(h => h.startsWith('#') ? h : `#${h}`).join(' ')
                    : '';

                const fullPost = content + hashtagSuffix;
                const withinLimit = fullPost.length <= config.maxLength;

                return JSON.stringify({
                    platform,
                    content: fullPost.substring(0, config.maxLength),
                    characterCount: fullPost.length,
                    maxLength: config.maxLength,
                    withinLimit,
                    hashtags: hashtags.slice(0, config.hashtagLimit),
                    truncated: !withinLimit,
                });
            }

            // If no content provided, return a structured prompt for the LLM to fill
            return JSON.stringify({
                platform,
                topic,
                tone,
                platformGuidelines: config.format,
                maxLength: config.maxLength,
                hashtagLimit: config.hashtagLimit,
                suggestedHashtags: hashtags,
                instruction: `Draft a ${platform} post about "${topic}" following the platform guidelines. Keep within ${config.maxLength} characters.`,
            });
        },
    };
}
