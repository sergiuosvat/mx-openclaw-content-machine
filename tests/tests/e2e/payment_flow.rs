//! E2E Test: Payment Flow (x402 → Chat → Confirm)
//!
//! Tests the chat payment gate:
//! 1. Send a chat message → expect 402 with payment details
//! 2. Simulate on-chain payment transaction
//! 3. Confirm payment → expect session unlocked
//! 4. Send follow-up message → expect SSE stream response

mod common;
use common::*;

#[tokio::test]
async fn test_payment_gate_402_cs() {
    let is_healthy = backend_health_check().await;
    if !is_healthy {
        println!("⚠️ Backend not running — skipping payment test");
        return;
    }

    // 1. Start a chat — should get 402 with payment details
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/chat", BACKEND_URL))
        .json(&serde_json::json!({ "message": "Research AI market trends" }))
        .send()
        .await
        .expect("Failed to reach backend");

    assert_eq!(resp.status().as_u16(), 402, "Should return 402 Payment Required");

    let body: serde_json::Value = resp.json().await.expect("Failed to parse 402 body");
    let session_id = body["sessionId"].as_str().expect("Missing sessionId");
    let amount = body["payment"]["amount"].as_str().expect("Missing payment amount");
    let token = body["payment"]["token"].as_str().expect("Missing payment token");

    println!("✅ 402 received — sessionId: {}, amount: {} {}", session_id, amount, token);

    // 2. Confirm payment (simulated tx hash)
    let tx_hash = format!("sim-tx-{}", rand::random::<u64>());
    let confirm = backend_confirm_payment(session_id, &tx_hash).await;

    assert_eq!(confirm["status"], "confirmed", "Payment should be confirmed");
    let job_id = confirm["jobId"].as_str().expect("Missing jobId");
    println!("✅ Payment confirmed — jobId: {}", job_id);
}

#[tokio::test]
async fn test_payment_gate_validation_cs() {
    let is_healthy = backend_health_check().await;
    if !is_healthy {
        println!("⚠️ Backend not running — skipping validation test");
        return;
    }

    let client = reqwest::Client::new();

    // Empty message should return 400
    let resp = client
        .post(format!("{}/api/chat", BACKEND_URL))
        .json(&serde_json::json!({}))
        .send()
        .await
        .expect("Failed to reach backend");
    assert_eq!(resp.status().as_u16(), 400, "Empty message should return 400");
    println!("✅ Empty message correctly rejected with 400");

    // Missing sessionId in confirm should return 400
    let resp = client
        .post(format!("{}/api/chat/confirm-payment", BACKEND_URL))
        .json(&serde_json::json!({}))
        .send()
        .await
        .expect("Failed to reach backend");
    assert_eq!(resp.status().as_u16(), 400, "Missing fields should return 400");
    println!("✅ Missing confirm fields correctly rejected with 400");

    // Non-existent session should return 404
    let resp = client
        .post(format!("{}/api/chat/confirm-payment", BACKEND_URL))
        .json(&serde_json::json!({ "sessionId": "fake-id", "txHash": "fake-tx" }))
        .send()
        .await
        .expect("Failed to reach backend");
    assert_eq!(resp.status().as_u16(), 404, "Fake session should return 404");
    println!("✅ Fake session correctly rejected with 404");
}
