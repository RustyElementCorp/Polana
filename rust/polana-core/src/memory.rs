use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{PolanaCoreError, validate_memory_id, validate_owner_id, validate_producer_id};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignatureDescriptor {
    pub algorithm: String,
    pub signer: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrityDescriptor {
    pub canonical_hash: String,
    pub hash_algorithm: String,
    pub signature: Option<SignatureDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryObject {
    pub schema_version: String,
    pub memory_id: String,
    pub content: Value,
    pub provenance: Value,
    pub producer: Value,
    pub ownership: Value,
    pub integrity: IntegrityDescriptor,
    pub timestamps: Value,
    pub policy: Option<Value>,
    pub attestations: Option<Vec<Value>>,
    pub anchors: Option<Vec<Value>>,
    pub tags: Option<Vec<String>>,
    pub relations: Option<Vec<Value>>,
}

impl MemoryObject {
    pub fn validate(&self) -> Result<(), PolanaCoreError> {
        if self.schema_version != "1.0.0" {
            return Err(PolanaCoreError::InvalidField("schema_version"));
        }

        validate_memory_id(&self.memory_id).map_err(|_| PolanaCoreError::InvalidField("memory_id"))?;

        validate_content(&self.content)?;
        validate_provenance(&self.provenance)?;
        validate_producer(&self.producer)?;
        validate_ownership(&self.ownership)?;
        validate_timestamps(&self.timestamps)?;

        if self.integrity.canonical_hash.len() != 64
            || !self
                .integrity
                .canonical_hash
                .chars()
                .all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase())
        {
            return Err(PolanaCoreError::InvalidField("integrity.canonical_hash"));
        }

        if self.integrity.hash_algorithm != "sha256"
            && self.integrity.hash_algorithm != "sha3-256"
            && self.integrity.hash_algorithm != "blake3"
        {
            return Err(PolanaCoreError::InvalidField("integrity.hash_algorithm"));
        }

        if let Some(signature) = &self.integrity.signature {
            if signature.algorithm != "ed25519"
                && signature.algorithm != "secp256k1"
                && signature.algorithm != "rsa-pss"
            {
                return Err(PolanaCoreError::InvalidField("integrity.signature.algorithm"));
            }

            if signature.signer.trim().is_empty() {
                return Err(PolanaCoreError::MissingField("integrity.signature.signer"));
            }

            if signature.value.trim().is_empty() {
                return Err(PolanaCoreError::MissingField("integrity.signature.value"));
            }
        }

        if let Some(policy) = &self.policy {
            let policy_id = get_required_string(policy, "policy_id", "policy.policy_id")?;
            if policy_id.trim().is_empty() {
                return Err(PolanaCoreError::MissingField("policy.policy_id"));
            }

            let visibility = get_required_string(policy, "visibility", "policy.visibility")?;
            if visibility != "public" && visibility != "restricted" && visibility != "private" {
                return Err(PolanaCoreError::InvalidField("policy.visibility"));
            }
        }

        Ok(())
    }
}

fn validate_content(content: &Value) -> Result<(), PolanaCoreError> {
    let cid = get_required_string(content, "cid", "content.cid")?;
    if cid.len() < 16 {
        return Err(PolanaCoreError::InvalidField("content.cid"));
    }

    let media_type = get_required_string(content, "media_type", "content.media_type")?;
    if media_type.trim().is_empty() {
        return Err(PolanaCoreError::MissingField("content.media_type"));
    }

    let encoding = get_required_string(content, "encoding", "content.encoding")?;
    if !matches!(encoding, "json" | "jsonl" | "cbor" | "text" | "binary") {
        return Err(PolanaCoreError::InvalidField("content.encoding"));
    }

    let size_bytes = get_required_u64(content, "size_bytes", "content.size_bytes")?;
    if size_bytes == 0 {
        return Err(PolanaCoreError::InvalidField("content.size_bytes"));
    }

    Ok(())
}

fn validate_provenance(provenance: &Value) -> Result<(), PolanaCoreError> {
    let model_name = get_required_string(provenance, "model_name", "provenance.model_name")?;
    if model_name.trim().is_empty() {
        return Err(PolanaCoreError::MissingField("provenance.model_name"));
    }

    let provider = get_required_string(provenance, "provider", "provenance.provider")?;
    if provider.trim().is_empty() {
        return Err(PolanaCoreError::MissingField("provenance.provider"));
    }

    let output_schema_version = get_required_string(
        provenance,
        "output_schema_version",
        "provenance.output_schema_version",
    )?;
    if output_schema_version.trim().is_empty() {
        return Err(PolanaCoreError::MissingField("provenance.output_schema_version"));
    }

    Ok(())
}

fn validate_producer(producer: &Value) -> Result<(), PolanaCoreError> {
    let producer_id = get_required_string(producer, "producer_id", "producer.producer_id")?;
    validate_producer_id(producer_id)?;

    let producer_type = get_required_string(producer, "producer_type", "producer.producer_type")?;
    if !matches!(
        producer_type,
        "agent" | "model" | "application" | "organization" | "human"
    ) {
        return Err(PolanaCoreError::InvalidField("producer.producer_type"));
    }

    Ok(())
}

fn validate_ownership(ownership: &Value) -> Result<(), PolanaCoreError> {
    let owner_id = get_required_string(ownership, "owner_id", "ownership.owner_id")?;
    validate_owner_id(owner_id)?;

    let owner_type = get_required_string(ownership, "owner_type", "ownership.owner_type")?;
    if !matches!(owner_type, "user" | "organization" | "application" | "shared") {
        return Err(PolanaCoreError::InvalidField("ownership.owner_type"));
    }

    Ok(())
}

fn validate_timestamps(timestamps: &Value) -> Result<(), PolanaCoreError> {
    let created_at = get_required_string(timestamps, "created_at", "timestamps.created_at")?;
    if !is_rfc3339_utc(created_at) {
        return Err(PolanaCoreError::InvalidField("timestamps.created_at"));
    }

    if let Some(recorded_at) = timestamps.get("recorded_at").and_then(Value::as_str) {
        if !is_rfc3339_utc(recorded_at) {
            return Err(PolanaCoreError::InvalidField("timestamps.recorded_at"));
        }
    }

    if let Some(source_clock) = timestamps.get("source_clock").and_then(Value::as_str) {
        if !matches!(source_clock, "app" | "ledger" | "anchor") {
            return Err(PolanaCoreError::InvalidField("timestamps.source_clock"));
        }
    }

    Ok(())
}

fn get_required_string<'a>(
    value: &'a Value,
    key: &str,
    label: &'static str,
) -> Result<&'a str, PolanaCoreError> {
    value.get(key)
        .and_then(Value::as_str)
        .ok_or(PolanaCoreError::MissingField(label))
}

fn get_required_u64(
    value: &Value,
    key: &str,
    label: &'static str,
) -> Result<u64, PolanaCoreError> {
    value.get(key)
        .and_then(Value::as_u64)
        .ok_or(PolanaCoreError::MissingField(label))
}

fn is_rfc3339_utc(value: &str) -> bool {
    value.len() == 20
        && value.as_bytes()[4] == b'-'
        && value.as_bytes()[7] == b'-'
        && value.as_bytes()[10] == b'T'
        && value.as_bytes()[13] == b':'
        && value.as_bytes()[16] == b':'
        && value.ends_with('Z')
}
