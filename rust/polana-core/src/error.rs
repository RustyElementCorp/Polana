use thiserror::Error;

#[derive(Debug, Error)]
pub enum PolanaCoreError {
    #[error("invalid memory object: {0}")]
    InvalidMemoryObject(String),
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("base64 decode error: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("signature verification failed")]
    SignatureVerificationFailed,
    #[error("missing producer public key")]
    MissingProducerKey,
    #[error("missing integrity signature")]
    MissingSignature,
    #[error("invalid public key pem")]
    InvalidPublicKeyPem,
    #[error("invalid signature bytes")]
    InvalidSignatureBytes,
    #[error("missing required field: {0}")]
    MissingField(&'static str),
    #[error("invalid field value: {0}")]
    InvalidField(&'static str),
}
