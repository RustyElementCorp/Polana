use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    PolanaCoreError, create_core_id_from_bytes, validate_anchor_id, validate_attestation_id,
    validate_binding_id, validate_memory_id, validate_owner_id, validate_producer_id,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttestationIssuerDescriptor {
    pub issuer_id: String,
    pub issuer_type: String,
    pub display_name: Option<String>,
    pub key_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttestationEvidenceDescriptor {
    pub method: String,
    pub value: Option<String>,
    pub r#ref: Option<String>,
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttestationTimestamps {
    pub issued_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttestationObject {
    pub schema_version: String,
    pub attestation_id: String,
    pub subject_id: String,
    pub subject_type: String,
    pub kind: String,
    pub issuer: AttestationIssuerDescriptor,
    pub evidence: AttestationEvidenceDescriptor,
    pub status: String,
    pub timestamps: AttestationTimestamps,
    pub notes: Option<String>,
}

impl AttestationObject {
    pub fn from_input(input: BuildAttestationInput) -> Result<Self, PolanaCoreError> {
        let attestation_id = match input.attestation_id.clone() {
            Some(attestation_id) => attestation_id,
            None => generate_attestation_id(&input)?,
        };

        let attestation = Self {
            schema_version: "1.0.0".into(),
            attestation_id,
            subject_id: input.subject_id,
            subject_type: input.subject_type,
            kind: input.kind,
            issuer: input.issuer,
            evidence: input.evidence,
            status: input.status,
            timestamps: input.timestamps,
            notes: input.notes,
        };

        attestation.validate()?;
        Ok(attestation)
    }

    pub fn validate(&self) -> Result<(), PolanaCoreError> {
        if self.schema_version != "1.0.0" {
            return Err(PolanaCoreError::InvalidField("attestation.schema_version"));
        }

        validate_attestation_id(&self.attestation_id)?;
        validate_attestation_subject_id(&self.subject_type, &self.subject_id)?;

        if !matches!(
            self.kind.as_str(),
            "producer_signature"
                | "human_review"
                | "enterprise_approval"
                | "execution_proof"
                | "compliance_check"
                | "binding_verification"
                | "anchor_confirmation"
        ) {
            return Err(PolanaCoreError::InvalidField("attestation.kind"));
        }

        validate_attestation_issuer(&self.issuer)?;
        validate_attestation_evidence(&self.evidence)?;

        if !matches!(self.status.as_str(), "issued" | "revoked") {
            return Err(PolanaCoreError::InvalidField("attestation.status"));
        }

        validate_timestamp(
            &self.timestamps.issued_at,
            "attestation.timestamps.issued_at",
            true,
        )?;
        if let Some(value) = &self.timestamps.revoked_at {
            validate_timestamp(value, "attestation.timestamps.revoked_at", false)?;
        }

        validate_attestation_lifecycle(self)?;

        Ok(())
    }
}

pub fn validate_attestation_lifecycle(
    attestation: &AttestationObject,
) -> Result<(), PolanaCoreError> {
    match attestation.status.as_str() {
        "issued" => {
            if attestation.timestamps.revoked_at.is_some() {
                return Err(PolanaCoreError::InvalidField(
                    "attestation.timestamps.revoked_at",
                ));
            }
        }
        "revoked" => {
            if attestation.timestamps.revoked_at.is_none() {
                return Err(PolanaCoreError::MissingField(
                    "attestation.timestamps.revoked_at",
                ));
            }
        }
        _ => return Err(PolanaCoreError::InvalidField("attestation.status")),
    }

    Ok(())
}

pub fn validate_attestation_transition(
    previous_status: &str,
    next_attestation: &AttestationObject,
) -> Result<(), PolanaCoreError> {
    next_attestation.validate()?;

    let next_status = next_attestation.status.as_str();
    let allowed = previous_status == next_status
        || (previous_status == "issued" && next_status == "revoked");

    if !allowed {
        return Err(PolanaCoreError::InvalidField("attestation.transition"));
    }

    Ok(())
}

fn generate_attestation_id(input: &BuildAttestationInput) -> Result<String, PolanaCoreError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| PolanaCoreError::InvalidField("attestation.timestamps.issued_at"))?
        .as_nanos();

    let seed = format!(
        "{}|{}|{}|{}|{}|{}",
        input.subject_id,
        input.subject_type,
        input.kind,
        input.issuer.issuer_id,
        input.evidence.method,
        now
    );
    let digest = Sha256::digest(seed.as_bytes());
    create_core_id_from_bytes("att", &digest[..16])
}

fn validate_attestation_subject_id(
    subject_type: &str,
    subject_id: &str,
) -> Result<(), PolanaCoreError> {
    match subject_type {
        "memory" => validate_memory_id(subject_id),
        "binding" => validate_binding_id(subject_id),
        "producer" => validate_producer_id(subject_id),
        "owner" => validate_owner_id(subject_id),
        "attestation" => validate_attestation_id(subject_id),
        "anchor" => validate_anchor_id(subject_id),
        _ => Err(PolanaCoreError::InvalidField("attestation.subject_type")),
    }
}

fn validate_attestation_issuer(
    issuer: &AttestationIssuerDescriptor,
) -> Result<(), PolanaCoreError> {
    match issuer.issuer_type.as_str() {
        "producer" => validate_producer_id(&issuer.issuer_id),
        "owner" => validate_owner_id(&issuer.issuer_id),
        _ => Err(PolanaCoreError::InvalidField("attestation.issuer.issuer_type")),
    }?;

    Ok(())
}

fn validate_attestation_evidence(
    evidence: &AttestationEvidenceDescriptor,
) -> Result<(), PolanaCoreError> {
    if evidence.method.trim().is_empty() {
        return Err(PolanaCoreError::MissingField("attestation.evidence.method"));
    }

    if let Some(hash) = &evidence.hash {
        if hash.len() < 64
            || hash.len() > 128
            || !hash
                .chars()
                .all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase())
        {
            return Err(PolanaCoreError::InvalidField("attestation.evidence.hash"));
        }
    }

    Ok(())
}

fn validate_timestamp(
    value: &str,
    label: &'static str,
    required: bool,
) -> Result<(), PolanaCoreError> {
    if value.is_empty() {
        if required {
            return Err(PolanaCoreError::MissingField(label));
        }
        return Ok(());
    }

    if value.len() != 20
        || value.as_bytes()[4] != b'-'
        || value.as_bytes()[7] != b'-'
        || value.as_bytes()[10] != b'T'
        || value.as_bytes()[13] != b':'
        || value.as_bytes()[16] != b':'
        || !value.ends_with('Z')
    {
        return Err(PolanaCoreError::InvalidField(label));
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BuildAttestationInput {
    pub attestation_id: Option<String>,
    pub subject_id: String,
    pub subject_type: String,
    pub kind: String,
    pub issuer: AttestationIssuerDescriptor,
    pub evidence: AttestationEvidenceDescriptor,
    pub status: String,
    pub timestamps: AttestationTimestamps,
    pub notes: Option<String>,
}
