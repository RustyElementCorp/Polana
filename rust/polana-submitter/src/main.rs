use std::{env, fs, process::ExitCode};

use polana_core::{anchor_payload_from_memory, verify_memory_signature, MemoryObject};

fn print_usage() {
    eprintln!("Usage:");
    eprintln!("  polana-submitter prepare-anchor <memory-object.json>");
    eprintln!("  polana-submitter verify-memory <memory-object.json>");
}

fn load_memory(path: &str) -> Result<MemoryObject, String> {
    let raw = fs::read_to_string(path).map_err(|err| format!("failed to read {path}: {err}"))?;
    serde_json::from_str(&raw).map_err(|err| format!("failed to parse memory object: {err}"))
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
        "prepare-anchor" => {
            let memory = match load_memory(&path) {
                Ok(memory) => memory,
                Err(message) => {
                    eprintln!("{message}");
                    return ExitCode::from(1);
                }
            };

            match anchor_payload_from_memory(&memory) {
                Ok(payload) => {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&payload)
                            .expect("anchor payload should serialize")
                    );
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!("{error}");
                    ExitCode::from(1)
                }
            }
        }
        "verify-memory" => {
            let memory = match load_memory(&path) {
                Ok(memory) => memory,
                Err(message) => {
                    eprintln!("{message}");
                    return ExitCode::from(1);
                }
            };

            if let Err(error) = memory.validate() {
                eprintln!("{error}");
                return ExitCode::from(1);
            }

            match verify_memory_signature(&memory) {
                Ok(()) => {
                    println!("ok");
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!("{error}");
                    ExitCode::from(1)
                }
            }
        }
        _ => {
            print_usage();
            ExitCode::from(1)
        }
    }
}
