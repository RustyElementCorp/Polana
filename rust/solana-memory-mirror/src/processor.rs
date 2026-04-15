use polana_core::AnchorPayload;
use solana_program::{program_error::ProgramError, pubkey::Pubkey};

use crate::{MemoryMirrorAccount, MemoryMirrorError, MemoryMirrorInstruction};

fn is_valid_lower_hex_64(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase())
}

pub fn memory_account_from_anchor(
    authority: Pubkey,
    anchor: AnchorPayload,
) -> Result<MemoryMirrorAccount, ProgramError> {
    if !anchor.memory_id.starts_with("mem_") {
        return Err(MemoryMirrorError::InvalidInstruction.into());
    }
    if !is_valid_lower_hex_64(&anchor.canonical_hash_hex) {
        return Err(MemoryMirrorError::InvalidCanonicalHash.into());
    }
    if anchor.content_cid.is_empty() {
        return Err(MemoryMirrorError::EmptyContentCid.into());
    }
    if anchor.producer_id.is_empty() {
        return Err(MemoryMirrorError::EmptyProducerId.into());
    }

    Ok(MemoryMirrorAccount {
        version: 1,
        authority,
        memory_id: anchor.memory_id,
        canonical_hash_hex: anchor.canonical_hash_hex,
        content_cid: anchor.content_cid,
        producer_id: anchor.producer_id,
        policy_id: anchor.policy_id,
        consumption_status: 0,
    })
}

pub fn account_matches_memory_id(
    account: &MemoryMirrorAccount,
    memory_id: &str,
) -> Result<(), ProgramError> {
    if account.memory_id != memory_id {
        return Err(MemoryMirrorError::MemoryIdMismatch.into());
    }
    Ok(())
}

pub fn apply_instruction(
    account: Option<MemoryMirrorAccount>,
    authority: Pubkey,
    instruction: MemoryMirrorInstruction,
) -> Result<MemoryMirrorAccount, ProgramError> {
    match instruction {
        MemoryMirrorInstruction::UpsertMemory {
            memory_id,
            canonical_hash_hex,
            content_cid,
            producer_id,
            policy_id,
        } => {
            let anchor = AnchorPayload {
                memory_id,
                canonical_hash_hex,
                content_cid,
                producer_id,
                policy_id,
            };

            let next = memory_account_from_anchor(authority, anchor)?;
            if let Some(existing) = account {
                account_matches_memory_id(&existing, &next.memory_id)?;
            }
            Ok(next)
        }
        MemoryMirrorInstruction::SetConsumptionStatus { memory_id, status } => {
            let mut existing = account.ok_or(MemoryMirrorError::InvalidInstruction)?;
            account_matches_memory_id(&existing, &memory_id)?;
            existing.consumption_status = status;
            Ok(existing)
        }
    }
}
