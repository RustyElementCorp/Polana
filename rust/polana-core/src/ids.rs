use data_encoding::BASE32_NOPAD;

use crate::PolanaCoreError;

const MIN_CORE_ID_BODY_LEN: usize = 20;
const MAX_CORE_ID_BODY_LEN: usize = 64;

fn validate_core_id(value: &str, prefix: &str, label: &'static str) -> Result<(), PolanaCoreError> {
    let expected_prefix = format!("{prefix}_");
    if !value.starts_with(&expected_prefix) {
        return Err(PolanaCoreError::InvalidField(label));
    }

    let body = &value[expected_prefix.len()..];
    if body.len() < MIN_CORE_ID_BODY_LEN || body.len() > MAX_CORE_ID_BODY_LEN {
        return Err(PolanaCoreError::InvalidField(label));
    }

    if !body
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit())
    {
        return Err(PolanaCoreError::InvalidField(label));
    }

    Ok(())
}

pub fn create_core_id_from_bytes(prefix: &str, bytes: &[u8]) -> Result<String, PolanaCoreError> {
    if bytes.len() < 16 {
        return Err(PolanaCoreError::InvalidField("core_id.bytes"));
    }

    let body = BASE32_NOPAD.encode(bytes).to_ascii_lowercase();
    validate_core_id(&format!("{prefix}_{body}"), prefix, "core_id.generated")?;
    Ok(format!("{prefix}_{body}"))
}

pub fn validate_producer_id(value: &str) -> Result<(), PolanaCoreError> {
    validate_core_id(value, "prod", "producer.producer_id")
}

pub fn validate_owner_id(value: &str) -> Result<(), PolanaCoreError> {
    validate_core_id(value, "own", "ownership.owner_id")
}

pub fn validate_binding_id(value: &str) -> Result<(), PolanaCoreError> {
    validate_core_id(value, "bind", "binding.binding_id")
}

pub fn validate_attestation_id(value: &str) -> Result<(), PolanaCoreError> {
    validate_core_id(value, "att", "attestation.attestation_id")
}

pub fn validate_anchor_id(value: &str) -> Result<(), PolanaCoreError> {
    validate_core_id(value, "anch", "anchor.anchor_id")
}
