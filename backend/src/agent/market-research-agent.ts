/**
 * MarketResearchAgent — First derivative of the OpenClaw template.
 *
 * Specializes in market research:
 * - search_web: Find relevant sources
 * - scrape_page: Extract data from URLs
 * - read_file: Analyze uploaded documents
 * - generate_report: Produce structured markdown reports
 */
import { BaseAgent, Tool } from './base-agent';
import { createSearchWebTool } from './tools/search_web';
import { createScrapePageTool } from './tools/scrape_page';
import { createReadFileTool } from './tools/read_file';
import { createGenerateReportTool } from './tools/generate_report';

export class MarketResearchAgent extends BaseAgent {
    private tools: Tool[];

    constructor() {
        super();
        this.tools = [
            createSearchWebTool(),
            createScrapePageTool(),
            createReadFileTool(),
            createGenerateReportTool(),
        ];
    }

    getTools(): Tool[] {
        return this.tools;
    }

    getSystemPrompt(): string {
        return `You are an expert market research analyst powered by MultiversX.

Your capabilities:
1. **search_web** — Search the internet for relevant information
2. **scrape_page** — Read and extract content from specific web pages
3. **read_file** — Analyze uploaded documents (PDF, CSV, TXT, MD)
4. **generate_report** — Create structured research reports

Guidelines:
- Always start by understanding the user's research question clearly
- Search for multiple sources to get a comprehensive view
- Cross-reference findings across sources for accuracy
- Structure your response as a clear, professional report
- Include source URLs for all claims
- If the user uploaded files, incorporate their data into the analysis
- Be objective — present both supporting and contradicting evidence
- Quantify findings when possible (market size, growth rates, etc.)

Output Format:
When you have gathered enough data, use generate_report to create a downloadable report with:
- Executive Summary
- Key Findings
- Market Analysis
- Competitive Landscape (if relevant)
- Recommendations
- Sources`;
    }
}
