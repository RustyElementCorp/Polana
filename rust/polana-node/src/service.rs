use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ServiceLaunchAttempt {
    pub status: String,
    pub launch_config: DevLaunchConfig,
    pub service_plan: NodeServicePlan,
    pub missing_components: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DevLaunchConfig {
    pub chain: String,
    pub base_path: String,
    pub rpc_port: u16,
    pub ws_port: u16,
    pub p2p_port: u16,
    pub validator: bool,
    pub alice: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct RelayerSubstrateConfig {
    pub chain_name: String,
    pub ws_url: String,
    pub pallet_name: String,
    pub event_name: String,
    pub storage_entry_name: String,
    pub start_block: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SolanaSinkConfig {
    pub rpc_url: String,
    pub program_id: String,
    pub authority_keypair_path: String,
    pub authority_pubkey: String,
    pub mirror_account_pubkey: String,
    pub outbox_path: String,
    pub recent_blockhash_override: String,
    pub submit_rpc: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct NodeServicePlan {
    pub service_status: String,
    pub runtime_crate: String,
    pub chain_spec_source: String,
    pub launch_mode: String,
    pub steps: Vec<String>,
    pub required_crates: Vec<String>,
    pub required_binaries: Vec<String>,
}

pub fn dev_launch_config() -> DevLaunchConfig {
    DevLaunchConfig {
        chain: "polana-dev".into(),
        base_path: "/tmp/polana-node".into(),
        rpc_port: 9933,
        ws_port: 9944,
        p2p_port: 30333,
        validator: true,
        alice: true,
    }
}

pub fn relayer_substrate_config() -> RelayerSubstrateConfig {
    RelayerSubstrateConfig {
        chain_name: "polana-dev".into(),
        ws_url: "ws://127.0.0.1:9944".into(),
        pallet_name: "MemoryRegistry".into(),
        event_name: "MemoryRegistered".into(),
        storage_entry_name: "Anchors".into(),
        start_block: 1,
    }
}

pub fn solana_sink_config() -> SolanaSinkConfig {
    SolanaSinkConfig {
        rpc_url: "http://127.0.0.1:8899".into(),
        program_id: "11111111111111111111111111111111".into(),
        authority_keypair_path: "/tmp/authority.json".into(),
        authority_pubkey: "11111111111111111111111111111111".into(),
        mirror_account_pubkey: "11111111111111111111111111111111".into(),
        outbox_path: "/tmp/polana-solana-outbox.jsonl".into(),
        recent_blockhash_override: "11111111111111111111111111111111".into(),
        submit_rpc: false,
    }
}

pub fn service_plan() -> NodeServicePlan {
    NodeServicePlan {
        service_status: "skeleton".into(),
        runtime_crate: "polana-runtime".into(),
        chain_spec_source: "polana-node::chain_spec::dev_chain_spec_preview".into(),
        launch_mode: "single-validator-dev".into(),
        steps: vec![
            "build a service-backed node binary around polana-runtime".into(),
            "translate dev_chain_spec_preview into a real chain spec".into(),
            "bind JSON-RPC on 9933 and websocket on 9944".into(),
            "start an authority node in development mode".into(),
            "expose MemoryRegistry storage and events to the relayer".into(),
        ],
        required_crates: vec![
            "sc-cli".into(),
            "sc-service".into(),
            "sc-network".into(),
            "sc-consensus-manual-seal or Aura stack".into(),
        ],
        required_binaries: vec![
            "polana-node".into(),
            "polana-relayer".into(),
            "solana-test-validator or remote Solana RPC".into(),
        ],
    }
}

pub fn current_service_launch_attempt() -> ServiceLaunchAttempt {
    ServiceLaunchAttempt {
        status: "service-not-wired".into(),
        launch_config: dev_launch_config(),
        service_plan: service_plan(),
        missing_components: vec![
            "sc-service based node assembly".into(),
            "real chain spec builder".into(),
            "network and RPC startup".into(),
            "authority/seal strategy selection".into(),
        ],
    }
}

pub fn try_run_dev_service() -> Result<(), ServiceLaunchAttempt> {
    Err(current_service_launch_attempt())
}
