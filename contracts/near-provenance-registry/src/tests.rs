use super::*;
use near_sdk::{
    NearToken, env,
    mock::MockAction,
    serde_json::{self, json},
    test_utils::{VMContextBuilder, get_created_receipts, get_logs},
    testing_env,
};
use std::panic::{AssertUnwindSafe, catch_unwind};

const ROOT: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PROFILE: &str = "qmesh-provenance-sha256-v1";
const PUBLISHER: &str = "publisher.testnet";
const DEPOSIT: u128 = 10_000_000_000_000_000_000_000;

fn registry() -> ProvenanceRegistry {
    let mut context = VMContextBuilder::new();
    context
        .current_account_id("registry.testnet".parse().unwrap())
        .predecessor_account_id("registry.testnet".parse().unwrap());
    testing_env!(context.build());
    let registry = ProvenanceRegistry::new(PUBLISHER.parse().unwrap());
    env::state_write(&registry);
    registry
}

fn call_as(predecessor: &str, deposit: u128, block_height: u64) {
    let mut context = VMContextBuilder::new();
    context
        .current_account_id("registry.testnet".parse().unwrap())
        .predecessor_account_id(predecessor.parse().unwrap())
        .signer_account_id(PUBLISHER.parse().unwrap())
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .storage_usage(env::storage_usage())
        .block_height(block_height)
        .block_timestamp(1_700_000_000_000_000_000 + block_height);
    testing_env!(context.build());
}

fn refunds() -> Vec<(AccountId, u128)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|receipt| {
            receipt.actions.into_iter().filter_map(move |action| {
                if let MockAction::Transfer { deposit, .. } = action {
                    Some((receipt.receiver_id.clone(), deposit.as_yoctonear()))
                } else {
                    None
                }
            })
        })
        .collect()
}

#[test]
fn persists_anchor_and_emits_receipt_metadata_as_decimal_strings() {
    let mut registry = registry();
    call_as(PUBLISHER, DEPOSIT, 42);
    let record = registry.anchor(ROOT.into(), 7, PROFILE.into());
    let expected = json!({
        "merkle_root": ROOT,
        "leaf_count": 7,
        "hash_profile": PROFILE,
        "publisher_id": PUBLISHER,
        "block_height": "42",
        "timestamp_ns": "1700000000000000042"
    });
    assert_eq!(serde_json::to_value(&record).unwrap(), expected);
    assert_eq!(registry.get_anchor(ROOT.into()), Some(record));
    let reloaded: ProvenanceRegistry = env::state_read().unwrap();
    assert_eq!(
        serde_json::to_value(reloaded.get_anchor(ROOT.into()).unwrap()).unwrap(),
        expected
    );
    assert_eq!(get_logs().len(), 1);
    let logs = get_logs();
    let event: serde_json::Value =
        serde_json::from_str(logs[0].strip_prefix("EVENT_JSON:").unwrap()).unwrap();
    assert_eq!(event["standard"], "qmesh-provenance");
    assert_eq!(event["event"], "anchor_registered");
    assert_eq!(event["data"], json!([expected]));
}

#[test]
fn only_the_immediate_publisher_can_register_even_if_the_signer_is_publisher() {
    let mut registry = registry();
    call_as("untrusted.testnet", DEPOSIT, 42);
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        registry.anchor(ROOT.into(), 7, PROFILE.into());
    }));
    assert!(outcome.is_err());
    assert_eq!(registry.get_anchor(ROOT.into()), None);
    assert!(get_logs().is_empty());
    assert!(refunds().is_empty());
}

#[test]
fn rejects_noncanonical_roots_without_writing_storage() {
    let mut registry = registry();
    for root in [
        String::new(),
        "0".repeat(63),
        "0".repeat(65),
        "A".repeat(64),
        "g".repeat(64),
        "é".repeat(32),
        format!(" {ROOT}"),
    ] {
        call_as(PUBLISHER, DEPOSIT, 42);
        let initial_storage = env::storage_usage();
        assert!(
            catch_unwind(AssertUnwindSafe(|| {
                registry.anchor(root.clone(), 7, PROFILE.into());
            }))
            .is_err(),
            "accepted invalid root {root:?}"
        );
        assert_eq!(env::storage_usage(), initial_storage);
        assert_eq!(registry.get_anchor(root), None);
    }
}

#[test]
fn rejects_unknown_hash_profiles() {
    let mut registry = registry();
    for profile in [
        "",
        "qmesh-provenance-sha256-v2",
        "QMESH-PROVENANCE-SHA256-V1",
    ] {
        call_as(PUBLISHER, DEPOSIT, 42);
        assert!(
            catch_unwind(AssertUnwindSafe(|| {
                registry.anchor(ROOT.into(), 7, profile.into());
            }))
            .is_err()
        );
        assert_eq!(registry.get_anchor(ROOT.into()), None);
    }
}

#[test]
fn enforces_both_leaf_count_bounds() {
    let mut registry = registry();
    for count in [0, 20_001, u32::MAX] {
        call_as(PUBLISHER, DEPOSIT, 42);
        assert!(
            catch_unwind(AssertUnwindSafe(|| {
                registry.anchor(ROOT.into(), count, PROFILE.into());
            }))
            .is_err()
        );
        assert_eq!(registry.get_anchor(ROOT.into()), None);
    }
    for (root, count) in [(ROOT.to_string(), 1), ("f".repeat(64), 20_000)] {
        call_as(PUBLISHER, DEPOSIT, 42);
        assert_eq!(
            registry.anchor(root, count, PROFILE.into()).leaf_count,
            count
        );
    }
}

#[test]
fn charges_measured_storage_and_refunds_only_the_excess() {
    let mut registry = registry();
    call_as(PUBLISHER, DEPOSIT, 42);
    let initial_storage = env::storage_usage();
    registry.anchor(ROOT.into(), 7, PROFILE.into());
    let storage_bytes = env::storage_usage() - initial_storage;
    assert!(storage_bytes > 0);
    let storage_cost = u128::from(storage_bytes) * env::storage_byte_cost().as_yoctonear();
    assert_eq!(
        refunds(),
        vec![(PUBLISHER.parse().unwrap(), DEPOSIT - storage_cost)]
    );

    call_as(PUBLISHER, storage_cost, 43);
    registry.anchor("f".repeat(64), 7, PROFILE.into());
    assert!(refunds().is_empty());
}

#[test]
#[should_panic(expected = "Insufficient storage deposit")]
fn rejects_an_unfunded_new_anchor() {
    let mut registry = registry();
    call_as(PUBLISHER, 0, 42);
    registry.anchor(ROOT.into(), 7, PROFILE.into());
}

#[test]
fn identical_repeat_returns_original_metadata_and_refunds_the_entire_deposit() {
    let mut registry = registry();
    call_as(PUBLISHER, DEPOSIT, 42);
    let original = registry.anchor(ROOT.into(), 7, PROFILE.into());
    let storage_after_first_anchor = env::storage_usage();
    call_as(PUBLISHER, DEPOSIT, 99);
    assert_eq!(registry.anchor(ROOT.into(), 7, PROFILE.into()), original);
    assert_eq!(env::storage_usage(), storage_after_first_anchor);
    assert_eq!(refunds(), vec![(PUBLISHER.parse().unwrap(), DEPOSIT)]);
    assert!(get_logs().is_empty());

    call_as(PUBLISHER, 0, 100);
    assert_eq!(registry.anchor(ROOT.into(), 7, PROFILE.into()), original);
    assert!(refunds().is_empty());
}

#[test]
fn conflicting_repeat_never_overwrites_the_original_record() {
    let mut registry = registry();
    call_as(PUBLISHER, DEPOSIT, 42);
    let original = registry.anchor(ROOT.into(), 7, PROFILE.into());
    call_as(PUBLISHER, DEPOSIT, 99);
    let initial_storage = env::storage_usage();
    assert!(
        catch_unwind(AssertUnwindSafe(|| {
            registry.anchor(ROOT.into(), 8, PROFILE.into());
        }))
        .is_err()
    );
    assert_eq!(registry.get_anchor(ROOT.into()), Some(original));
    assert_eq!(env::storage_usage(), initial_storage);
    assert!(get_logs().is_empty());
}

#[test]
fn missing_root_returns_none_to_any_caller() {
    let registry = registry();
    call_as("reader.testnet", 0, 42);
    assert_eq!(registry.get_anchor(ROOT.into()), None);
}
