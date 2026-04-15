use serde::Serialize;

use crate::runtime::{RuntimeSummary, runtime_summary};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DevChainSpecPreview {
    pub name: String,
    pub id: String,
    pub chain_type: String,
    pub bootnodes: Vec<String>,
    pub telemetry_endpoints: Vec<String>,
    pub protocol_id: String,
    pub properties: serde_json::Value,
    pub runtime: RuntimeSummary,
}

pub fn dev_chain_spec_preview() -> DevChainSpecPreview {
    DevChainSpecPreview {
        name: "Polana Dev".into(),
        id: "polana-dev".into(),
        chain_type: "Development".into(),
        bootnodes: vec![],
        telemetry_endpoints: vec![],
        protocol_id: "polana".into(),
        properties: serde_json::json!({
            "tokenSymbol": "POLA",
            "tokenDecimals": 12,
            "ss58Format": 42
        }),
        runtime: runtime_summary(),
    }
}
