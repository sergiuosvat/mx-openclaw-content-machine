#![allow(dead_code, unused_imports)]

use bech32::{self, Bech32, Hrp};
use multiversx_sc::proxy_imports::*;
use multiversx_sc::types::{Address, CodeMetadata, ManagedBuffer};
use multiversx_sc_snippets::imports::*;

pub const GATEWAY_URL: &str = "http://localhost:8085";
pub const IDENTITY_WASM_PATH: &str = "artifacts/identity-registry.wasm";
pub const VALIDATION_WASM_PATH: &str = "artifacts/validation-registry.wasm";
pub const REPUTATION_WASM_PATH: &str = "artifacts/reputation-registry.wasm";

/// Backend API URL (Express server)
pub const BACKEND_URL: &str = "http://localhost:4000";

// ── Chain Simulator Helpers ──

pub async fn get_simulator_chain_id() -> String {
    let client = reqwest::Client::new();
    let resp: serde_json::Value = client
        .get(format!("{}/network/config", GATEWAY_URL))
        .send()
        .await
        .expect("Failed to get network config")
        .json()
        .await
        .expect("Failed to parse network config");

    resp["data"]["config"]["erd_chain_id"]
        .as_str()
        .expect("Chain ID not found")
        .to_string()
}

pub async fn fund_address_on_simulator(address_bech32: &str, balance_wei: &str) {
    let client = reqwest::Client::new();
    let body = serde_json::json!([{
        "address": address_bech32,
        "balance": balance_wei,
        "nonce": 0
    }]);

    for attempt in 0..5 {
        let res = client
            .post(format!("{}/simulator/set-state", GATEWAY_URL))
            .json(&body)
            .send()
            .await;

        match res {
            Ok(resp) if resp.status().is_success() => return,
            Ok(resp) => println!("fund_address attempt {} failed: {}", attempt, resp.status()),
            Err(e) => println!("fund_address attempt {} error: {}", attempt, e),
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
    }
    panic!("Failed to fund address after 5 retries");
}

pub async fn generate_blocks_on_simulator(num_blocks: u32) {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/simulator/generate-blocks/{}", GATEWAY_URL, num_blocks))
        .send()
        .await
        .expect("Failed to generate blocks");
    assert!(res.status().is_success(), "generate-blocks failed");
}

pub fn address_to_bech32(address: &Address) -> String {
    let hrp = Hrp::parse("erd").expect("Invalid HRP");
    bech32::encode::<Bech32>(hrp, address.as_bytes()).expect("Failed to encode")
}

pub fn generate_random_private_key() -> String {
    use rand::RngCore;
    let mut rng = rand::thread_rng();
    let mut key = [0u8; 32];
    rng.fill_bytes(&mut key);
    hex::encode(key)
}

// ── Backend API Helpers ──

pub async fn backend_health_check() -> bool {
    let client = reqwest::Client::new();
    match client.get(format!("{}/api/health", BACKEND_URL)).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

pub async fn backend_get_agent_profile() -> serde_json::Value {
    let client = reqwest::Client::new();
    client
        .get(format!("{}/api/agent", BACKEND_URL))
        .send()
        .await
        .expect("Failed to get agent profile")
        .json()
        .await
        .expect("Failed to parse agent profile")
}

pub async fn backend_start_chat(message: &str) -> serde_json::Value {
    let client = reqwest::Client::new();
    client
        .post(format!("{}/api/chat", BACKEND_URL))
        .json(&serde_json::json!({ "message": message }))
        .send()
        .await
        .expect("Failed to start chat")
        .json()
        .await
        .expect("Failed to parse chat response")
}

pub async fn backend_confirm_payment(session_id: &str, tx_hash: &str) -> serde_json::Value {
    let client = reqwest::Client::new();
    client
        .post(format!("{}/api/chat/confirm-payment", BACKEND_URL))
        .json(&serde_json::json!({
            "sessionId": session_id,
            "txHash": tx_hash
        }))
        .send()
        .await
        .expect("Failed to confirm payment")
        .json()
        .await
        .expect("Failed to parse confirmation")
}

// ── Identity Registry Interactor ──

pub struct IdentityRegistryInteractor {
    pub wallet_address: Address,
    pub contract_address: Address,
}

impl IdentityRegistryInteractor {
    pub async fn deploy(interactor: &mut Interactor, wallet_address: Address) -> Self {
        println!("Deploying Identity Registry...");
        let wasm_bytes = std::fs::read(IDENTITY_WASM_PATH)
            .expect("Failed to read identity WASM. Run setup.sh first.");
        let code_buf = ManagedBuffer::new_from_bytes(&wasm_bytes);

        interactor.generate_blocks_until_all_activations().await;

        let contract_address = interactor
            .tx()
            .from(&wallet_address)
            .gas(600_000_000)
            .raw_deploy()
            .code(code_buf)
            .code_metadata(
                CodeMetadata::UPGRADEABLE
                    | CodeMetadata::READABLE
                    | CodeMetadata::PAYABLE
                    | CodeMetadata::PAYABLE_BY_SC,
            )
            .returns(ReturnsNewAddress)
            .run()
            .await;

        println!("Identity Registry deployed at: {}", contract_address);

        Self {
            wallet_address,
            contract_address,
        }
    }

    pub async fn issue_token(&self, interactor: &mut Interactor, name: &str, ticker: &str) {
        let name_buf: ManagedBuffer<StaticApi> = ManagedBuffer::new_from_bytes(name.as_bytes());
        let ticker_buf: ManagedBuffer<StaticApi> = ManagedBuffer::new_from_bytes(ticker.as_bytes());

        interactor
            .tx()
            .from(&self.wallet_address)
            .to(&self.contract_address)
            .gas(600_000_000)
            .egld(50_000_000_000_000_000u64)
            .raw_call("issue_token")
            .argument(&name_buf)
            .argument(&ticker_buf)
            .run()
            .await;

        let _ = interactor.generate_blocks(3).await;
        println!("Token issued: {}", ticker);
    }

    pub async fn register_agent(
        &self,
        interactor: &mut Interactor,
        name: &str,
        uri: &str,
    ) {
        let name_buf: ManagedBuffer<StaticApi> = ManagedBuffer::new_from_bytes(name.as_bytes());
        let uri_buf: ManagedBuffer<StaticApi> = ManagedBuffer::new_from_bytes(uri.as_bytes());
        let pk_buf: ManagedBuffer<StaticApi> = ManagedBuffer::new_from_bytes(&[0u8; 32]);
        let metadata_count: u32 = 0;
        let metadata_count_buf: ManagedBuffer<StaticApi> =
            ManagedBuffer::new_from_bytes(&metadata_count.to_be_bytes());
        let services_count: u32 = 0;
        let services_count_buf: ManagedBuffer<StaticApi> =
            ManagedBuffer::new_from_bytes(&services_count.to_be_bytes());

        interactor
            .tx()
            .from(&self.wallet_address)
            .to(&self.contract_address)
            .gas(600_000_000)
            .raw_call("register_agent")
            .argument(&name_buf)
            .argument(&uri_buf)
            .argument(&pk_buf)
            .argument(&metadata_count_buf)
            .argument(&services_count_buf)
            .run()
            .await;

        println!("Agent registered: {}", name);
    }
}
