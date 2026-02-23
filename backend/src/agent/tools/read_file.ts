/**
 * read_file — Reads uploaded files (PDF, CSV, TXT) and returns their text content.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { Tool } from '../base-agent';

export function createReadFileTool(): Tool {
    return {
        name: 'read_file',
        description: 'Read the contents of an uploaded file. Supports PDF (text layer), CSV, TXT, and MD files.',
        parameters: {
            filePath: { type: 'string', description: 'Path to the uploaded file', required: true },
            maxLength: { type: 'number', description: 'Max characters to return (default: 10000)', required: false },
        },
        execute: async (args: Record<string, unknown>): Promise<string> => {
            const filePath = args.filePath as string;
            const maxLength = (args.maxLength as number) || 10000;

            if (!filePath) {
                return JSON.stringify({ error: 'filePath is required' });
            }

            const uploadsDir = path.resolve(__dirname, '../../../uploads');
            const resolvedPath = path.resolve(uploadsDir, filePath);

            // Security: ensure the path is within uploads dir
            if (!resolvedPath.startsWith(uploadsDir)) {
                return JSON.stringify({ error: 'Access denied: file must be within uploads directory' });
            }

            try {
                const ext = path.extname(resolvedPath).toLowerCase();

                let content: string;

                if (['.txt', '.md', '.csv'].includes(ext)) {
                    content = await fs.readFile(resolvedPath, 'utf8');
                } else if (ext === '.pdf') {
                    // For PDF: try to read as text (basic extraction)
                    // In production, use pdf-parse or similar library
                    const buffer = await fs.readFile(resolvedPath);
                    content = buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ');
                } else {
                    return JSON.stringify({ error: `Unsupported file type: ${ext}. Supports: .txt, .md, .csv, .pdf` });
                }

                return JSON.stringify({
                    filePath,
                    extension: ext,
                    content: content.substring(0, maxLength),
                    length: content.length,
                    truncated: content.length > maxLength,
                });
            } catch (err) {
                return JSON.stringify({ error: `Read failed: ${(err as Error).message}`, filePath });
            }
        },
    };
}
