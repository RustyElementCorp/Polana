use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct MemoryMirrorAccount {
    pub version: u8,
    pub authority: Pubkey,
    pub memory_id: String,
    pub canonical_hash_hex: String,
    pub content_cid: String,
    pub producer_id: String,
    pub policy_id: Option<String>,
    pub consumption_status: u8,
}

impl MemoryMirrorAccount {
    pub fn size_hint(
        memory_id: &str,
        canonical_hash_hex: &str,
        content_cid: &str,
        producer_id: &str,
        policy_id: Option<&str>,
    ) -> usize {
        let mut size = 1 + 32;
        size += string_space(memory_id);
        size += string_space(canonical_hash_hex);
        size += string_space(content_cid);
        size += string_space(producer_id);
        size += 1;
        if let Some(policy_id) = policy_id {
            size += string_space(policy_id);
        }
        size += 1;
        size
    }
}

fn string_space(value: &str) -> usize {
    4 + value.len()
}
