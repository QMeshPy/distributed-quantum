use near_sdk::{
    AccountId, NearToken, PanicOnDefault, Promise, collections::LookupMap, env, json_types::U64,
    near, require, serde_json::json,
};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnchorRecord {
    pub merkle_root: String,
    pub leaf_count: u32,
    pub hash_profile: String,
    pub publisher_id: AccountId,
    pub block_height: U64,
    pub timestamp_ns: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct ProvenanceRegistry {
    publisher_id: AccountId,
    anchors: LookupMap<String, AnchorRecord>,
}

#[near]
impl ProvenanceRegistry {
    #[init]
    #[private]
    pub fn new(publisher_id: AccountId) -> Self {
        Self {
            publisher_id,
            anchors: LookupMap::new(b"a"),
        }
    }

    #[payable]
    pub fn anchor(
        &mut self,
        merkle_root: String,
        leaf_count: u32,
        hash_profile: String,
    ) -> AnchorRecord {
        require!(
            env::predecessor_account_id() == self.publisher_id,
            "Only the publisher can anchor"
        );
        require!(
            merkle_root.len() == 64
                && merkle_root
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)),
            "Merkle root must be 64 lowercase hexadecimal characters"
        );
        require!((1..=20_000).contains(&leaf_count), "Invalid leaf count");
        require!(
            hash_profile == "qmesh-provenance-sha256-v1",
            "Unsupported hash profile"
        );

        let deposit = env::attached_deposit().as_yoctonear();
        if let Some(existing) = self.anchors.get(&merkle_root) {
            require!(
                existing.leaf_count == leaf_count && existing.hash_profile == hash_profile,
                "Conflicting anchor metadata"
            );
            refund(deposit);
            return existing;
        }

        let record = AnchorRecord {
            merkle_root,
            leaf_count,
            hash_profile,
            publisher_id: self.publisher_id.clone(),
            block_height: U64(env::block_height()),
            timestamp_ns: U64(env::block_timestamp()),
        };
        let storage_before = env::storage_usage();
        self.anchors.insert(&record.merkle_root, &record);
        let storage_cost = u128::from(env::storage_usage() - storage_before)
            * env::storage_byte_cost().as_yoctonear();
        // NEAR rolls back the insertion if the deposit check fails.
        require!(deposit >= storage_cost, "Insufficient storage deposit");
        refund(deposit - storage_cost);
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "qmesh-provenance",
                "version": "1.0.0",
                "event": "anchor_registered",
                "data": [&record],
            })
        ));
        record
    }

    pub fn get_anchor(&self, merkle_root: String) -> Option<AnchorRecord> {
        self.anchors.get(&merkle_root)
    }
}

fn refund(amount: u128) {
    if amount > 0 {
        Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(amount));
    }
}

#[cfg(test)]
mod tests;
