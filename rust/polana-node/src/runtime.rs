use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct RuntimeSummary {
    pub runtime_name: String,
    pub account_id_type: String,
    pub nonce_type: String,
    pub block_number_type: String,
    pub hash_type: String,
    pub pallets: Vec<String>,
    pub max_field_length: u32,
}

pub fn runtime_summary() -> RuntimeSummary {
    let _ = core::any::TypeId::of::<polana_runtime::Runtime>();

    RuntimeSummary {
        runtime_name: "polana-runtime".into(),
        account_id_type: "u64".into(),
        nonce_type: "u64".into(),
        block_number_type: "u64".into(),
        hash_type: "H256".into(),
        pallets: vec!["System".into(), "MemoryRegistry".into()],
        max_field_length: 256,
    }
}
