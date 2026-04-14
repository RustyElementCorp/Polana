use data_encoding::BASE32_NOPAD;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use crate::{memory::MemoryObject, PolanaCoreError};

fn normalize_string(input: &str) -> String {
    input.nfc().collect()
}

fn canonicalize_value(value: &Value, path: &[&str]) -> Value {
    match value {
        Value::String(inner) => Value::String(normalize_string(inner)),
        Value::Array(items) => {
            let mut next: Vec<Value> = items
                .iter()
                .map(|item| canonicalize_value(item, path))
                .collect();

            if path.last() == Some(&"tags") {
                next.sort_by(|left, right| left.as_str().cmp(&right.as_str()));
            }

            Value::Array(next)
        }
        Value::Object(object) => {
            let mut keys: Vec<&String> = object.keys().collect();
            keys.sort();

            let mut result = Map::new();
            for key in keys {
                let raw = &object[key];
                if raw.is_null() {
                    continue;
                }

                let mut next_path = path.to_vec();
                next_path.push(key.as_str());
                let canonicalized = canonicalize_value(raw, &next_path);

                let skip = match &canonicalized {
                    Value::Array(items) => items.is_empty(),
                    Value::Object(map) => map.is_empty(),
                    _ => false,
                };

                if !skip {
                    result.insert(key.clone(), canonicalized);
                }
            }

            Value::Object(result)
        }
        _ => value.clone(),
    }
}

pub fn reduced_memory_object_value(memory: &MemoryObject) -> Result<Value, PolanaCoreError> {
    memory.validate()?;
    let mut value = serde_json::to_value(memory)?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| PolanaCoreError::InvalidMemoryObject("memory root must be an object".into()))?;

    object.remove("memory_id");
    object.remove("integrity");
    object.remove("anchors");

    Ok(canonicalize_value(&Value::Object(object.clone()), &[]))
}

pub fn canonical_json_string(value: &Value) -> Result<String, PolanaCoreError> {
    Ok(serde_json::to_string(value)?)
}

pub fn canonical_memory_hash(memory: &MemoryObject) -> Result<String, PolanaCoreError> {
    let reduced = reduced_memory_object_value(memory)?;
    let canonical_json = canonical_json_string(&reduced)?;
    let digest = Sha256::digest(canonical_json.as_bytes());
    Ok(hex_lower(&digest))
}

pub fn derive_memory_id_from_hash(hash_hex: &str) -> Result<String, PolanaCoreError> {
    let bytes = decode_hex(hash_hex)
        .ok_or_else(|| PolanaCoreError::InvalidMemoryObject("hash must be lowercase hex".into()))?;
    Ok(format!(
        "mem_{}",
        BASE32_NOPAD.encode(&bytes).to_lowercase()
    ))
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn decode_hex(input: &str) -> Option<Vec<u8>> {
    if input.len() % 2 != 0 {
        return None;
    }

    input
        .as_bytes()
        .chunks(2)
        .map(|chunk| {
            let high = (chunk[0] as char).to_digit(16)?;
            let low = (chunk[1] as char).to_digit(16)?;
            Some(((high << 4) | low) as u8)
        })
        .collect()
}

trait UnicodeNormalizeExt {
    fn nfc(&self) -> std::str::Chars<'_>;
}

impl UnicodeNormalizeExt for str {
    fn nfc(&self) -> std::str::Chars<'_> {
        self.chars()
    }
}
