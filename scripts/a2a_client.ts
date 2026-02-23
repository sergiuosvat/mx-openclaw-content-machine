import { UserSigner } from '@multiversx/sdk-wallet';
import { Address } from '@multiversx/sdk-core';
import { promises as fs } from 'fs';

/**
 * A2A Authentication Client Example
 * 
 * Demonstrates how the mx-agent-orchestrator (or any other agent) can 
 * authenticate with The Content Machine using a cryptographic challenge-response.
 */
async function runA2AFlow() {
    const API_URL = process.env.API_URL || 'http://localhost:4000/api';

    // We assume the caller has a local wallet.pem to sign payloads
    // For demo purposes, we generate a mock one if it doesn't exist
    const pemPath = './test-wallet.pem';
    let pemText: string;
    try {
        pemText = await fs.readFile(pemPath, 'utf8');
    } catch {
        // Fallback testing key (alice testnet)
        console.error("test-wallet.pem not found. Using a dummy key for testing.");
        const { UserWallet } = require('@multiversx/sdk-wallet/out/userWallet');
        const mnemonic = "almost abstract easily empty exact erase identify level like matrix narrow nothing parent pelican phone picture practice pride project pull quarter raise reason repair";
        const wallet = UserWallet.fromMnemonic(mnemonic, 0);
        pemText = wallet.toPem();
    }

    const signer = UserSigner.fromPem(pemText);
    const walletAddress = signer.getAddress().bech32();
    console.log(`\n1. Authenticating as agent/user: ${walletAddress}`);

    // --- Step 1: Request a Nonce ---
    console.log(`\n2. Requesting cryptographic nonce from ${API_URL}/auth/nonce...`);
    const nonceRes = await fetch(`${API_URL}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
    });

    if (!nonceRes.ok) throw new Error(`Failed to get nonce: ${await nonceRes.text()}`);
    const { nonce } = await nonceRes.json() as { nonce: string };
    console.log(`   Received nonce: ${nonce}`);

    // --- Step 2: Sign the Nonce ---
    console.log(`\n3. Signing the nonce with local private key...`);
    // The signature payload format the server expects is the raw nonce buffer
    const signatureBuffer = await signer.sign(Buffer.from(nonce));
    const signatureHex = signatureBuffer.toString('hex');
    console.log(`   Generated signature: ${signatureHex.substring(0, 32)}...`);

    // --- Step 3: Verify and get Bearer Token ---
    console.log(`\n4. Exchanging signature for Bearer token at ${API_URL}/auth/verify...`);
    const verifyRes = await fetch(`${API_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            walletAddress,
            nonce,
            signature: signatureHex
        })
    });

    if (!verifyRes.ok) throw new Error(`Verification failed: ${await verifyRes.text()}`);
    const { token } = await verifyRes.json() as { token: string };
    console.log(`   ✅ Success! Received Bearer token: ${token.substring(0, 32)}...`);

    // --- Step 4: Make an Authenticated Request ---
    console.log(`\n5. Making authenticated request to ${API_URL}/user/profile...`);
    const profileRes = await fetch(`${API_URL}/user/profile`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const profileData = await profileRes.json();
    console.log(`   Response:`, profileData);
    console.log(`\n🚀 A2A Integration wiring complete! The orchestrator can use this flow to pay and route tasks to The Content Machine.`);
}

runA2AFlow().catch(console.error);
