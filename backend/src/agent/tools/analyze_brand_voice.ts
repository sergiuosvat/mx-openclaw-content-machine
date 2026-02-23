/**
 * analyze_brand_voice — Per-user brand voice profile.
 *
 * Multi-user: reads/writes from UserStore by wallet address.
 * Falls back to default profile for anonymous users.
 */
import { Tool, AgentContext } from '../base-agent';
import { UserStore, BrandVoiceProfile } from '../../user/user-store';

const DEFAULT_PROFILE: BrandVoiceProfile = {
    tone: 'Professional yet approachable. Confident but not arrogant. Uses data to back up claims.',
    vocabulary: ['innovative', 'actionable', 'scalable', 'data-driven', 'cutting-edge'],
    doList: [
        'Use short, punchy sentences',
        'Include specific numbers and metrics',
        'Start with a hook or bold statement',
        'End with a clear call to action',
        'Use active voice',
    ],
    dontList: [
        'Don\'t use jargon without explaining it',
        'Don\'t write paragraphs longer than 3 sentences',
        'Don\'t use passive voice',
        'Don\'t start with "In today\'s world..."',
        'Don\'t use exclamation marks excessively',
    ],
    examplePosts: [
        'We analyzed 10,000 SaaS companies. The top 1% all share one thing: they ship weekly. Here\'s the breakdown →',
        'Your landing page has 3 seconds. That\'s it. Here are 5 patterns that convert at 12%+ (with examples):',
    ],
    hashtagStrategy: 'Use 3-5 relevant hashtags. Mix broad (#marketing) with niche (#saasmarketing). No hashtag spam.',
    targetAudience: 'Founders, marketers, and creators building digital businesses.',
    contentPillars: ['Industry insights', 'How-to guides', 'Case studies', 'Tool reviews', 'Personal stories'],
};

export function createAnalyzeBrandVoiceTool(): Tool {
    return {
        name: 'analyze_brand_voice',
        description: 'Load the brand voice profile for the current user. Returns their personalized tone, vocabulary, and content guidelines. If no profile exists, returns a default.',
        parameters: {
            action: { type: 'string', description: '"load" to get profile, "save" to update profile', required: false },
            profile: { type: 'object', description: 'Brand voice profile to save (only when action=save)', required: false },
        },
        execute: async (args: Record<string, unknown>, context?: AgentContext): Promise<string> => {
            const walletAddress = context?.walletAddress;
            const userStore = context?.userStore as UserStore | undefined;
            const action = (args.action as string) || 'load';

            // Save action — persist the profile for this user
            if (action === 'save' && walletAddress && userStore && args.profile) {
                const profile = args.profile as BrandVoiceProfile;
                userStore.saveBrandVoice(walletAddress, profile);
                return JSON.stringify({
                    success: true,
                    walletAddress,
                    note: 'Brand voice profile saved. All future content will use this style.',
                });
            }

            // Load action — get profile for this user
            if (walletAddress && userStore) {
                const profile = userStore.getBrandVoice(walletAddress);
                if (profile) {
                    return JSON.stringify({
                        source: 'user-profile',
                        walletAddress,
                        profile,
                        note: 'Use this profile to match the user\'s exact writing style in all generated content.',
                    });
                }
            }

            // Fallback to default
            return JSON.stringify({
                source: 'default',
                profile: DEFAULT_PROFILE,
                note: walletAddress
                    ? 'No custom brand voice found for this wallet. Using default. Ask the user if they want to customize their brand voice.'
                    : 'Anonymous user — using default brand voice. Connect a wallet to save a custom profile.',
            });
        },
    };
}
