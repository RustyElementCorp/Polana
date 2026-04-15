use std::{fs, path::Path};

use serde::Serialize;

use crate::{
    chain_spec::dev_chain_spec_preview,
    runtime::runtime_summary,
    service::{
        current_service_launch_attempt, dev_launch_config, relayer_substrate_config,
        service_plan, solana_sink_config,
    },
};

pub fn write_dev_artifacts(output_dir: &str) -> Result<serde_json::Value, String> {
    let dir = Path::new(output_dir);
    fs::create_dir_all(dir)
        .map_err(|error| format!("failed to create output dir {}: {error}", dir.display()))?;

    let runtime_path = dir.join("runtime-summary.json");
    let chain_spec_path = dir.join("dev-chain-spec.json");
    let launch_config_path = dir.join("dev-launch-config.json");
    let service_plan_path = dir.join("node-service-plan.json");
    let launch_attempt_path = dir.join("service-launch-attempt.json");
    let substrate_config_path = dir.join("relayer-substrate-config.json");
    let solana_config_path = dir.join("relayer-solana-sink-config.json");

    write_json(&runtime_path, &runtime_summary())?;
    write_json(&chain_spec_path, &dev_chain_spec_preview())?;
    write_json(&launch_config_path, &dev_launch_config())?;
    write_json(&service_plan_path, &service_plan())?;
    write_json(&launch_attempt_path, &current_service_launch_attempt())?;
    write_json(&substrate_config_path, &relayer_substrate_config())?;
    write_json(&solana_config_path, &solana_sink_config())?;

    Ok(serde_json::json!({
        "runtime_summary": runtime_path.display().to_string(),
        "dev_chain_spec": chain_spec_path.display().to_string(),
        "dev_launch_config": launch_config_path.display().to_string(),
        "node_service_plan": service_plan_path.display().to_string(),
        "service_launch_attempt": launch_attempt_path.display().to_string(),
        "relayer_substrate_config": substrate_config_path.display().to_string(),
        "relayer_solana_sink_config": solana_config_path.display().to_string()
    }))
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(value)
        .map_err(|error| format!("failed to serialize {}: {error}", path.display()))?;
    fs::write(path, raw).map_err(|error| format!("failed to write {}: {error}", path.display()))
}
