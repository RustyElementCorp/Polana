use base64::Engine;
use ed25519_dalek::{Signer, Signature, SigningKey, Verifier, VerifyingKey};

use crate::memory::{MemoryObject, SignatureDescriptor};

use crate::{canonical::canonical_json_string, canonical::reduced_memory_object_value, PolanaCoreError};

fn strip_pem(pem: &str) -> String {
    pem.lines()
        .filter(|line| !line.starts_with("-----"))
        .collect::<Vec<_>>()
        .join("")
}

fn parse_public_key_from_pem(pem: &str) -> Result<VerifyingKey, PolanaCoreError> {
    let pem_body = strip_pem(pem);
    let der = base64::engine::general_purpose::STANDARD.decode(pem_body)?;

    let raw_key = if der.len() >= 32 {
        &der[der.len() - 32..]
    } else {
        return Err(PolanaCoreError::InvalidPublicKeyPem);
    };

    let bytes: [u8; 32] = raw_key
        .try_into()
        .map_err(|_| PolanaCoreError::InvalidPublicKeyPem)?;
    VerifyingKey::from_bytes(&bytes).map_err(|_| PolanaCoreError::InvalidPublicKeyPem)
}

fn parse_private_key_from_pem(pem: &str) -> Result<SigningKey, PolanaCoreError> {
    let pem_body = strip_pem(pem);
    let der = base64::engine::general_purpose::STANDARD.decode(pem_body)?;

    let raw_key = if der.len() >= 32 {
        &der[der.len() - 32..]
    } else {
        return Err(PolanaCoreError::InvalidPublicKeyPem);
    };

    let bytes: [u8; 32] = raw_key
        .try_into()
        .map_err(|_| PolanaCoreError::InvalidPublicKeyPem)?;
    Ok(SigningKey::from_bytes(&bytes))
}

pub fn sign_memory_payload(
    memory: &MemoryObject,
    private_key_pem: &str,
    signer: &str,
) -> Result<SignatureDescriptor, PolanaCoreError> {
    memory.validate()?;

    let signing_key = parse_private_key_from_pem(private_key_pem)?;
    let reduced = reduced_memory_object_value(memory)?;
    let payload = canonical_json_string(&reduced)?;
    let signature = signing_key.sign(payload.as_bytes());

    Ok(SignatureDescriptor {
        algorithm: "ed25519".into(),
        signer: signer.into(),
        value: base64::engine::general_purpose::STANDARD.encode(signature.to_bytes()),
    })
}

pub fn verify_memory_signature(memory: &MemoryObject) -> Result<(), PolanaCoreError> {
    memory.validate()?;

    let signature = memory
        .integrity
        .signature
        .as_ref()
        .ok_or(PolanaCoreError::MissingSignature)?;

    let public_key_pem = memory
        .producer
        .get("key_ref")
        .and_then(|value| value.as_str())
        .ok_or(PolanaCoreError::MissingProducerKey)?;

    let verifying_key = parse_public_key_from_pem(public_key_pem)?;
    let reduced = reduced_memory_object_value(memory)?;
    let payload = canonical_json_string(&reduced)?;

    let signature_bytes = base64::engine::general_purpose::STANDARD.decode(&signature.value)?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| PolanaCoreError::InvalidSignatureBytes)?;

    verifying_key
        .verify(payload.as_bytes(), &signature)
        .map_err(|_| PolanaCoreError::SignatureVerificationFailed)
}
