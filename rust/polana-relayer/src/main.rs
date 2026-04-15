use std::{env, fs, process::ExitCode};

use polana_core::AnchorPayload;
use polana_relayer::{
    build_preview_from_anchor, build_preview_from_memory, load_memory, relay_anchor_source_file,
    relay_anchor_source_to_jsonl_sink, relay_memory_file, SubstrateAnchorSourceConfig,
    SubxtSubstrateAnchorClient,
};

fn print_usage() {
    eprintln!("Usage:");
    eprintln!("  polana-relayer preview <memory-object.json>");
    eprintln!("  polana-relayer relay-memory <memory-object.json> <mirror-sink.jsonl> <checkpoint.json>");
    eprintln!("  polana-relayer preview-anchor <anchor-payload.json>");
    eprintln!("  polana-relayer relay-anchor-source <anchor-source.jsonl> <mirror-sink.jsonl> <checkpoint.json>");
    eprintln!("  polana-relayer poll-substrate-once <substrate-config.json> <mirror-sink.jsonl> <checkpoint.json>");
}

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let Some(command) = args.next() else {
        print_usage();
        return ExitCode::from(1);
    };

    let Some(path) = args.next() else {
        print_usage();
        return ExitCode::from(1);
    };

    match command.as_str() {
        "preview" => {
            let memory = match load_memory(&path) {
                Ok(memory) => memory,
                Err(message) => {
                    eprintln!("{message}");
                    return ExitCode::from(1);
                }
            };

            let preview = match build_preview_from_memory(&memory) {
                Ok(preview) => preview,
                Err(message) => {
                    eprintln!("{message}");
                    return ExitCode::from(1);
                }
            };

            println!(
                "{}",
                serde_json::to_string_pretty(&preview).expect("preview should serialize")
            );
            ExitCode::SUCCESS
        }
        "preview-anchor" => {
            let raw = match std::fs::read_to_string(&path) {
                Ok(raw) => raw,
                Err(error) => {
                    eprintln!("failed to read {path}: {error}");
                    return ExitCode::from(1);
                }
            };
            let payload: AnchorPayload = match serde_json::from_str(&raw) {
                Ok(payload) => payload,
                Err(error) => {
                    eprintln!("failed to parse anchor payload: {error}");
                    return ExitCode::from(1);
                }
            };

            let preview = match build_preview_from_anchor(&payload) {
                Ok(preview) => preview,
                Err(message) => {
                    eprintln!("{message}");
                    return ExitCode::from(1);
                }
            };

            println!(
                "{}",
                serde_json::to_string_pretty(&preview).expect("preview should serialize")
            );
            ExitCode::SUCCESS
        }
        "relay-memory" => {
            let Some(sink_path) = args.next() else {
                print_usage();
                return ExitCode::from(1);
            };
            let Some(checkpoint_path) = args.next() else {
                print_usage();
                return ExitCode::from(1);
            };

            let outcome = match relay_memory_file(&path, &sink_path, &checkpoint_path) {
                Ok(outcome) => outcome,
                Err(message) => {
                    eprintln!("{message}");
                    return ExitCode::from(1);
                }
            };

            println!(
                "{}",
                serde_json::to_string_pretty(&outcome).expect("outcome should serialize")
            );
            ExitCode::SUCCESS
        }
        "relay-anchor-source" => {
            let Some(sink_path) = args.next() else {
                print_usage();
                return ExitCode::from(1);
            };
            let Some(checkpoint_path) = args.next() else {
                print_usage();
                return ExitCode::from(1);
            };

            let outcomes = match relay_anchor_source_file(&path, &sink_path, &checkpoint_path) {
                Ok(outcomes) => outcomes,
                Err(message) => {
                    eprintln!("{message}");
                    return ExitCode::from(1);
                }
            };

            println!(
                "{}",
                serde_json::to_string_pretty(&outcomes).expect("outcomes should serialize")
            );
            ExitCode::SUCCESS
        }
        "poll-substrate-once" => {
            let Some(sink_path) = args.next() else {
                print_usage();
                return ExitCode::from(1);
            };
            let Some(checkpoint_path) = args.next() else {
                print_usage();
                return ExitCode::from(1);
            };

            let raw = match fs::read_to_string(&path) {
                Ok(raw) => raw,
                Err(error) => {
                    eprintln!("failed to read {path}: {error}");
                    return ExitCode::from(1);
                }
            };
            let config: SubstrateAnchorSourceConfig = match serde_json::from_str(&raw) {
                Ok(config) => config,
                Err(error) => {
                    eprintln!("failed to parse substrate config: {error}");
                    return ExitCode::from(1);
                }
            };

            let runtime = match tokio::runtime::Runtime::new() {
                Ok(runtime) => runtime,
                Err(error) => {
                    eprintln!("failed to create tokio runtime: {error}");
                    return ExitCode::from(1);
                }
            };

            let outcomes = match runtime.block_on(async {
                let client = SubxtSubstrateAnchorClient::from_config(&config).await?;
                let mut source = client.poll_source_once(config).await?;
                relay_anchor_source_to_jsonl_sink(&mut source, &sink_path, &checkpoint_path)
            }) {
                Ok(outcomes) => outcomes,
                Err(message) => {
                    eprintln!("{message}");
                    return ExitCode::from(1);
                }
            };

            println!(
                "{}",
                serde_json::to_string_pretty(&outcomes).expect("outcomes should serialize")
            );
            ExitCode::SUCCESS
        }
        _ => {
            print_usage();
            ExitCode::from(1)
        }
    }
}
