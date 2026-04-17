use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    PolanaCoreError, create_core_id_from_bytes, validate_anchor_id, validate_attestation_id,
    validate_binding_id, validate_owner_id, validate_producer_id,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExternalAddressReference {
    pub network: String,
    pub address: String,
    pub scheme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BindingVerificationDescriptor {
    pub status: String,
    pub method: String,
    pub evidence_ref: Option<String>,
    pub verified_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BindingTimestamps {
    pub created_at: String,
    pub verified_at: Option<String>,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BindingObject {
    pub schema_version: String,
    pub binding_id: String,
    pub subject_id: String,
    pub subject_type: String,
    pub external_ref: ExternalAddressReference,
    pub verification: BindingVerificationDescriptor,
    pub timestamps: BindingTimestamps,
    pub notes: Option<String>,
}

impl BindingObject {
    pub fn from_input(input: BuildBindingInput) -> Result<Self, PolanaCoreError> {
        let binding_id = match input.binding_id.clone() {
            Some(binding_id) => binding_id,
            None => generate_binding_id(&input)?,
        };

        let binding = Self {
            schema_version: "1.0.0".into(),
            binding_id,
            subject_id: input.subject_id,
            subject_type: input.subject_type,
            external_ref: input.external_ref,
            verification: input.verification,
            timestamps: input.timestamps,
            notes: input.notes,
        };

        binding.validate()?;
        Ok(binding)
    }

    pub fn validate(&self) -> Result<(), PolanaCoreError> {
        if self.schema_version != "1.0.0" {
            return Err(PolanaCoreError::InvalidField("binding.schema_version"));
        }

        validate_binding_id(&self.binding_id)?;
        validate_binding_subject_id(&self.subject_id)?;

        if !matches!(
            self.subject_type.as_str(),
            "producer" | "owner" | "attestation" | "anchor"
        ) {
            return Err(PolanaCoreError::InvalidField("binding.subject_type"));
        }

        if self.external_ref.network.trim().is_empty() {
            return Err(PolanaCoreError::MissingField("binding.external_ref.network"));
        }
        if self.external_ref.address.trim().is_empty() {
            return Err(PolanaCoreError::MissingField("binding.external_ref.address"));
        }
        if self.external_ref.scheme.trim().is_empty() {
            return Err(PolanaCoreError::MissingField("binding.external_ref.scheme"));
        }

        if !matches!(
            self.verification.status.as_str(),
            "claimed" | "verified" | "revoked"
        ) {
            return Err(PolanaCoreError::InvalidField("binding.verification.status"));
        }

        if self.verification.method.trim().is_empty() {
            return Err(PolanaCoreError::MissingField("binding.verification.method"));
        }

        validate_timestamp(
            &self.timestamps.created_at,
            "binding.timestamps.created_at",
            true,
        )?;
        if let Some(value) = &self.timestamps.verified_at {
            validate_timestamp(value, "binding.timestamps.verified_at", false)?;
        }
        if let Some(value) = &self.timestamps.revoked_at {
            validate_timestamp(value, "binding.timestamps.revoked_at", false)?;
        }

        validate_binding_lifecycle(self)?;

        Ok(())
    }
}

pub fn validate_binding_lifecycle(binding: &BindingObject) -> Result<(), PolanaCoreError> {
    match binding.verification.status.as_str() {
        "claimed" => {
            if binding.timestamps.verified_at.is_some() {
                return Err(PolanaCoreError::InvalidField("binding.timestamps.verified_at"));
            }
            if binding.timestamps.revoked_at.is_some() {
                return Err(PolanaCoreError::InvalidField("binding.timestamps.revoked_at"));
            }
        }
        "verified" => {
            if binding.timestamps.verified_at.is_none() {
                return Err(PolanaCoreError::MissingField("binding.timestamps.verified_at"));
            }
            if binding.timestamps.revoked_at.is_some() {
                return Err(PolanaCoreError::InvalidField("binding.timestamps.revoked_at"));
            }
        }
        "revoked" => {
            if binding.timestamps.revoked_at.is_none() {
                return Err(PolanaCoreError::MissingField("binding.timestamps.revoked_at"));
            }
        }
        _ => return Err(PolanaCoreError::InvalidField("binding.verification.status")),
    }

    Ok(())
}

pub fn validate_binding_transition(
    previous_status: &str,
    next_binding: &BindingObject,
) -> Result<(), PolanaCoreError> {
    next_binding.validate()?;

    let next_status = next_binding.verification.status.as_str();
    let allowed = previous_status == next_status
        || (previous_status == "claimed" && (next_status == "verified" || next_status == "revoked"))
        || (previous_status == "verified" && next_status == "revoked");

    if !allowed {
        return Err(PolanaCoreError::InvalidField("binding.transition"));
    }

    Ok(())
}

fn generate_binding_id(input: &BuildBindingInput) -> Result<String, PolanaCoreError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| PolanaCoreError::InvalidField("binding.timestamps.created_at"))?
        .as_nanos();

    let seed = format!(
        "{}|{}|{}|{}|{}",
        input.subject_id,
        input.subject_type,
        input.external_ref.network,
        input.external_ref.address,
        now
    );
    let digest = Sha256::digest(seed.as_bytes());
    create_core_id_from_bytes("bind", &digest[..16])
}

fn validate_binding_subject_id(value: &str) -> Result<(), PolanaCoreError> {
    if value.starts_with("prod_") {
        return validate_producer_id(value);
    }
    if value.starts_with("own_") {
        return validate_owner_id(value);
    }
    if value.starts_with("att_") {
        return validate_attestation_id(value)
            .map_err(|_| PolanaCoreError::InvalidField("binding.subject_id"));
    }
    if value.starts_with("anch_") {
        return validate_anchor_id(value).map_err(|_| PolanaCoreError::InvalidField("binding.subject_id"));
    }

    Err(PolanaCoreError::InvalidField("binding.subject_id"))
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
pub struct BuildBindingInput {
    pub binding_id: Option<String>,
    pub subject_id: String,
    pub subject_type: String,
    pub external_ref: ExternalAddressReference,
    pub verification: BindingVerificationDescriptor,
    pub timestamps: BindingTimestamps,
    pub notes: Option<String>,
}
