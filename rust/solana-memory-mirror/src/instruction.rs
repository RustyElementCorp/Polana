use borsh::{BorshDeserialize, BorshSerialize};
use polana_core::AnchorPayload;

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum MemoryMirrorInstruction {
    UpsertMemory {
        memory_id: String,
        canonical_hash_hex: String,
        content_cid: String,
        producer_id: String,
        policy_id: Option<String>,
    },
    SetConsumptionStatus {
        memory_id: String,
        status: u8,
    },
}

impl From<AnchorPayload> for MemoryMirrorInstruction {
    fn from(value: AnchorPayload) -> Self {
        Self::UpsertMemory {
            memory_id: value.memory_id,
            canonical_hash_hex: value.canonical_hash_hex,
            content_cid: value.content_cid,
            producer_id: value.producer_id,
            policy_id: value.policy_id,
        }
    }
}
