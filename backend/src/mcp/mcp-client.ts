/**
 * MCP Client — connects to MultiversX MCP Server for agent world state.
 *
 * In production: queries the real MCP server (multiversx-mcp-server).
 * In test mode: returns mock data.
 */

export interface AgentProfile {
    nonce: number;
    name: string;
    uri: string;
    owner: string;
    publicKey: string;
}

export interface AgentReputation {
    nonce: number;
    score: number;
    totalJobs: number;
}

export interface NetworkStatus {
    healthy: boolean;
    chainId: string;
    currentRound: number;
    gasPrice: number;
}

export class McpClient {
    public readonly baseUrl: string;
    private isTestMode: boolean;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
        this.isTestMode = process.env.NODE_ENV === 'test';
    }

    async getAgentProfile(nonce: number): Promise<AgentProfile | null> {
        if (this.isTestMode) {
            if (nonce === 999999) return null;
            return {
                nonce,
                name: `test-agent-${nonce}`,
                uri: `https://test.example.com/agents/${nonce}`,
                owner: 'erd1test...',
                publicKey: '0x' + '00'.repeat(32),
            };
        }

        try {
            const resp = await fetch(`${this.baseUrl}/agents/${nonce}/profile`);
            if (!resp.ok) return null;
            return (await resp.json()) as AgentProfile;
        } catch {
            return null;
        }
    }

    async searchAgents(query: string): Promise<AgentProfile[]> {
        if (this.isTestMode) {
            return [
                {
                    nonce: 1,
                    name: `${query}-bot`,
                    uri: `https://test.example.com/agents/1`,
                    owner: 'erd1test...',
                    publicKey: '0x' + '00'.repeat(32),
                },
            ];
        }

        try {
            const resp = await fetch(`${this.baseUrl}/agents/search?q=${encodeURIComponent(query)}`);
            if (!resp.ok) return [];
            return (await resp.json()) as AgentProfile[];
        } catch {
            return [];
        }
    }

    async getGasPrice(): Promise<number> {
        if (this.isTestMode) {
            return 1000000000; // 1 Gwei mock
        }

        try {
            const resp = await fetch(`${this.baseUrl}/network/gas-price`);
            if (!resp.ok) return 0;
            const data = (await resp.json()) as { gasPrice: number };
            return data.gasPrice;
        } catch {
            return 0;
        }
    }

    async getAgentReputation(nonce: number): Promise<AgentReputation> {
        if (this.isTestMode) {
            return { nonce, score: 85, totalJobs: 42 };
        }

        try {
            const resp = await fetch(`${this.baseUrl}/agents/${nonce}/reputation`);
            if (!resp.ok) return { nonce, score: 0, totalJobs: 0 };
            return (await resp.json()) as AgentReputation;
        } catch {
            return { nonce, score: 0, totalJobs: 0 };
        }
    }

    async getNetworkStatus(): Promise<NetworkStatus> {
        if (this.isTestMode) {
            return {
                healthy: true,
                chainId: 'D',
                currentRound: 12345,
                gasPrice: 1000000000,
            };
        }

        try {
            const resp = await fetch(`${this.baseUrl}/network/status`);
            if (!resp.ok) {
                return { healthy: false, chainId: '', currentRound: 0, gasPrice: 0 };
            }
            return (await resp.json()) as NetworkStatus;
        } catch {
            return { healthy: false, chainId: '', currentRound: 0, gasPrice: 0 };
        }
    }
}
