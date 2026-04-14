use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    canonical_memory_hash, derive_memory_id_from_hash,
    memory::{IntegrityDescriptor, MemoryObject},
    signer::sign_memory_payload,
    PolanaCoreError,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySignerInput {
    pub algorithm: String,
    pub private_key_pem: String,
    pub public_key_pem: String,
    pub signer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildMemoryInput {
    pub content: Value,
    pub provenance: Value,
    pub producer: Value,
    pub ownership: Value,
    pub timestamps: Value,
    pub policy: Option<Value>,
    pub attestations: Option<Vec<Value>>,
    pub anchors: Option<Vec<Value>>,
    pub tags: Option<Vec<String>>,
    pub relations: Option<Vec<Value>>,
    pub signer: Option<MemorySignerInput>,
}

pub fn build_memory_object(input: BuildMemoryInput) -> Result<MemoryObject, PolanaCoreError> {
    let mut producer = input.producer;
    if let Some(signer) = &input.signer {
        let producer_object = producer
            .as_object_mut()
            .ok_or_else(|| PolanaCoreError::InvalidField("producer"))?;
        producer_object
            .entry("key_ref")
            .or_insert(Value::String(signer.public_key_pem.clone()));
    }

    let draft = MemoryObject {
        schema_version: "1.0.0".into(),
        memory_id: "mem_placeholder_temporary".into(),
        content: input.content,
        provenance: input.provenance,
        producer,
        ownership: input.ownership,
        integrity: IntegrityDescriptor {
            canonical_hash: "0".repeat(64),
            hash_algorithm: "sha256".into(),
            signature: None,
        },
        timestamps: input.timestamps,
        policy: input.policy,
        attestations: input.attestations,
        anchors: input.anchors,
        tags: input.tags,
        relations: input.relations,
    };

    let canonical_hash = canonical_memory_hash(&draft)?;
    let memory_id = derive_memory_id_from_hash(&canonical_hash)?;

    let mut memory = MemoryObject {
        memory_id,
        integrity: IntegrityDescriptor {
            canonical_hash,
            hash_algorithm: "sha256".into(),
            signature: None,
        },
        ..draft
    };

    if let Some(signer) = input.signer {
        let signature = sign_memory_payload(
            &memory,
            &signer.private_key_pem,
            signer.signer.as_deref().unwrap_or(&signer.public_key_pem),
        )?;
        memory.integrity.signature = Some(signature);
    }

    memory.validate()?;
    Ok(memory)
}
