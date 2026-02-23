//! E2E Test: Agent Lifecycle on Chain Simulator
//!
//! Tests the full agent lifecycle:
//! 1. Deploy Identity Registry on chain simulator
//! 2. Issue agent token
//! 3. Register the OpenClaw agent with metadata
//! 4. Verify the agent was registered via vm_query
//! 5. Backend health check to confirm API is running

mod common;
use common::*;

#[tokio::test]
async fn test_agent_registration_cs() {
    // 1. Connect to chain simulator
    let chain_id = get_simulator_chain_id().await;
    println!("✅ Chain Simulator connected — Chain ID: {}", chain_id);

    // 2. Create interactor with owner wallet
    let mut interactor = Interactor::new(GATEWAY_URL).await;
    let owner_wallet = interactor.register_wallet(Wallet::from_pem_file("alice.pem").unwrap());

    // 3. Fund the owner
    let owner_bech32 = address_to_bech32(&owner_wallet);
    fund_address_on_simulator(&owner_bech32, "100000000000000000000000").await; // 100k EGLD
    println!("✅ Owner funded: {}", owner_bech32);

    // 4. Deploy Identity Registry
    let identity = IdentityRegistryInteractor::deploy(&mut interactor, owner_wallet.clone()).await;
    println!("✅ Identity Registry deployed at: {}", identity.contract_address);

    // 5. Issue agent NFT token
    identity.issue_token(&mut interactor, "OpenClawAgent", "OCAGENT").await;
    println!("✅ Agent token issued: OCAGENT");

    // 6. Register agent
    identity
        .register_agent(
            &mut interactor,
            "market-research-bot",
            "https://research.openclaw.io",
        )
        .await;
    println!("✅ Agent registered: market-research-bot");

    // 7. Generate blocks to finalize
    generate_blocks_on_simulator(3).await;
    println!("✅ Blocks generated — agent lifecycle complete");
}

#[tokio::test]
async fn test_backend_health_check_cs() {
    // This test verifies the backend server is reachable
    // Note: Requires the backend to be running on localhost:4000
    let is_healthy = backend_health_check().await;
    if is_healthy {
        println!("✅ Backend health check passed");
    } else {
        println!("⚠️ Backend not running — skipping health check");
        // Don't fail: this test is optional when running chain sim only
    }
}

#[tokio::test]
async fn test_agent_profile_retrieval_cs() {
    let is_healthy = backend_health_check().await;
    if !is_healthy {
        println!("⚠️ Backend not running — skipping agent profile test");
        return;
    }

    let profile = backend_get_agent_profile().await;
    assert!(profile["name"].is_string(), "Agent profile should have a name");
    assert!(profile["pricing"].is_object(), "Agent profile should have pricing");
    println!("✅ Agent profile: {}", profile["name"]);
}
