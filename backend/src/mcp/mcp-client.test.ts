import { McpClient } from './mcp-client';

// Set test env
process.env.NODE_ENV = 'test';

describe('McpClient', () => {
    let client: McpClient;

    beforeEach(() => {
        client = new McpClient('http://localhost:3000');
    });

    describe('constructor', () => {
        it('should accept a URL and store it', () => {
            expect(client.baseUrl).toBe('http://localhost:3000');
        });
    });

    describe('getAgentProfile', () => {
        it('should return agent profile data for a valid nonce', async () => {
            const profile = await client.getAgentProfile(1);
            // In test mode, returns mock data
            expect(profile).toBeDefined();
            expect(profile!.nonce).toBe(1);
            expect(profile!.name).toBeDefined();
        });

        it('should return null for non-existent nonce', async () => {
            const profile = await client.getAgentProfile(999999);
            expect(profile).toBeNull();
        });
    });

    describe('searchAgents', () => {
        it('should return an array of agents matching a query', async () => {
            const agents = await client.searchAgents('research');
            expect(Array.isArray(agents)).toBe(true);
        });
    });

    describe('getGasPrice', () => {
        it('should return current gas price as a number', async () => {
            const gasPrice = await client.getGasPrice();
            expect(typeof gasPrice).toBe('number');
            expect(gasPrice).toBeGreaterThan(0);
        });
    });

    describe('getAgentReputation', () => {
        it('should return reputation score for a valid nonce', async () => {
            const rep = await client.getAgentReputation(1);
            expect(rep).toBeDefined();
            expect(typeof rep.score).toBe('number');
            expect(typeof rep.totalJobs).toBe('number');
        });
    });

    describe('getNetworkStatus', () => {
        it('should return network health status', async () => {
            const status = await client.getNetworkStatus();
            expect(status).toBeDefined();
            expect(status.healthy).toBeDefined();
        });
    });
});
