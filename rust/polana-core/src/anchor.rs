use serde::{Deserialize, Serialize};

use crate::{MemoryObject, PolanaCoreError};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AnchorPayload {
    pub memory_id: String,
    pub canonical_hash_hex: String,
    pub content_cid: String,
    pub producer_id: String,
    pub policy_id: Option<String>,
}

pub fn anchor_payload_from_memory(memory: &MemoryObject) -> Result<AnchorPayload, PolanaCoreError> {
    memory.validate()?;

    let content_cid = memory
        .content
        .get("cid")
        .and_then(|value| value.as_str())
        .ok_or(PolanaCoreError::MissingField("content.cid"))?;

    let producer_id = memory
        .producer
        .get("producer_id")
        .and_then(|value| value.as_str())
        .ok_or(PolanaCoreError::MissingField("producer.producer_id"))?;

    let policy_id = memory
        .policy
        .as_ref()
        .and_then(|policy| policy.get("policy_id"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned);

    Ok(AnchorPayload {
        memory_id: memory.memory_id.clone(),
        canonical_hash_hex: memory.integrity.canonical_hash.clone(),
        content_cid: content_cid.to_owned(),
        producer_id: producer_id.to_owned(),
        policy_id,
    })
}
