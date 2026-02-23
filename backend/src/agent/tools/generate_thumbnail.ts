/**
 * generate_thumbnail — Generates image prompts for thumbnails and social graphics.
 * When IMAGE_API_KEY is set, calls an image generation API (OpenAI DALL-E).
 */
import axios from 'axios';
import { Tool } from '../base-agent';

interface PlatformDimensions {
    width: number;
    height: number;
    aspectRatio: string;
}

const PLATFORM_DIMENSIONS: Record<string, PlatformDimensions> = {
    youtube: { width: 1280, height: 720, aspectRatio: '16:9' },
    instagram_post: { width: 1080, height: 1080, aspectRatio: '1:1' },
    instagram_story: { width: 1080, height: 1920, aspectRatio: '9:16' },
    twitter: { width: 1200, height: 675, aspectRatio: '16:9' },
    x: { width: 1200, height: 675, aspectRatio: '16:9' },
    linkedin: { width: 1200, height: 627, aspectRatio: '1.91:1' },
    facebook: { width: 1200, height: 630, aspectRatio: '1.91:1' },
    blog: { width: 1200, height: 630, aspectRatio: '1.91:1' },
};

export function createGenerateThumbnailTool(): Tool {
    return {
        name: 'generate_thumbnail',
        description: 'Generate image prompts (and optionally images) for thumbnails and social graphics. Returns recommended dimensions and a detailed prompt for image generation.',
        parameters: {
            topic: { type: 'string', description: 'What the thumbnail should depict or relate to', required: true },
            platform: { type: 'string', description: 'Target platform: youtube, instagram_post, instagram_story, twitter, linkedin, blog', required: false },
            style: { type: 'string', description: 'Visual style: minimalist, bold, photorealistic, illustrated, gradient (default: bold)', required: false },
            text: { type: 'string', description: 'Text overlay to include on the thumbnail', required: false },
        },
        execute: async (args: Record<string, unknown>): Promise<string> => {
            const topic = args.topic as string;
            const platform = ((args.platform as string) || 'youtube').toLowerCase();
            const style = (args.style as string) || 'bold';
            const overlayText = args.text as string | undefined;

            if (!topic || topic.trim().length === 0) {
                return JSON.stringify({ error: 'Topic is required' });
            }

            const dimensions = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS.youtube;

            // Build detailed image generation prompt
            const promptParts = [
                `A ${style} ${platform} thumbnail about "${topic}".`,
                `Style: ${style}, modern, high-contrast, eye-catching.`,
                'Professional quality, clean composition.',
                dimensions.aspectRatio === '1:1' ? 'Square format.' : `Wide format (${dimensions.aspectRatio}).`,
            ];

            if (overlayText) {
                promptParts.push(`Include bold text overlay: "${overlayText}".`);
            }

            promptParts.push('Vibrant colors, high resolution, suitable for social media.');

            const imagePrompt = promptParts.join(' ');

            // If IMAGE_API_KEY is set, try to generate the actual image
            const imageApiKey = process.env.IMAGE_API_KEY;
            if (imageApiKey) {
                try {
                    const response = await axios.post('https://api.openai.com/v1/images/generations', {
                        model: 'dall-e-3',
                        prompt: imagePrompt,
                        n: 1,
                        size: dimensions.width >= 1200 ? '1792x1024' : '1024x1024',
                    }, {
                        headers: { 'Authorization': `Bearer ${imageApiKey}` },
                        timeout: 60000,
                    });

                    const imageUrl = (response.data as Record<string, unknown[]>).data?.[0] as Record<string, string> | undefined;

                    return JSON.stringify({
                        platform,
                        dimensions,
                        prompt: imagePrompt,
                        imageUrl: imageUrl?.url || null,
                        revisedPrompt: imageUrl?.revised_prompt || null,
                        generated: true,
                    });
                } catch (err) {
                    return JSON.stringify({
                        platform,
                        dimensions,
                        prompt: imagePrompt,
                        imageUrl: null,
                        generated: false,
                        error: `Image generation failed: ${(err as Error).message}. Use the prompt with your preferred image generator.`,
                    });
                }
            }

            // No API key — return prompt only
            return JSON.stringify({
                platform,
                dimensions,
                prompt: imagePrompt,
                imageUrl: null,
                generated: false,
                note: 'Set IMAGE_API_KEY in .env to enable automatic image generation. Use this prompt with DALL-E, Midjourney, or Stable Diffusion.',
            });
        },
    };
}
