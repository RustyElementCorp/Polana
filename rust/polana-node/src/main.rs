mod artifacts;
mod chain_spec;
mod runtime;
mod service;

use std::{env, process::ExitCode};

use artifacts::write_dev_artifacts;
use chain_spec::dev_chain_spec_preview;
use runtime::runtime_summary;
use service::{current_service_launch_attempt, service_plan, try_run_dev_service};

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let Some(command) = args.next() else {
        print_usage();
        return ExitCode::from(1);
    };

    match command.as_str() {
        "describe-runtime" => {
            println!(
                "{}",
                serde_json::to_string_pretty(&runtime_summary()).expect("runtime summary serializes")
            );
            ExitCode::SUCCESS
        }
        "print-dev-spec" => {
            println!(
                "{}",
                serde_json::to_string_pretty(&dev_chain_spec_preview())
                    .expect("chain spec preview serializes")
            );
            ExitCode::SUCCESS
        }
        "describe-service-plan" => {
            println!(
                "{}",
                serde_json::to_string_pretty(&service_plan()).expect("service plan serializes")
            );
            ExitCode::SUCCESS
        }
        "describe-launch-attempt" => {
            println!(
                "{}",
                serde_json::to_string_pretty(&current_service_launch_attempt())
                    .expect("service attempt serializes")
            );
            ExitCode::SUCCESS
        }
        "run-dev" => {
            match try_run_dev_service() {
                Ok(()) => ExitCode::SUCCESS,
                Err(attempt) => {
                    eprintln!(
                        "polana-node service launch is not fully wired yet."
                    );
                    eprintln!(
                        "{}",
                        serde_json::to_string_pretty(&attempt).expect("service attempt serializes")
                    );
                    ExitCode::from(2)
                }
            }
        }
        "write-dev-artifacts" => {
            let Some(output_dir) = args.next() else {
                print_usage();
                return ExitCode::from(1);
            };

            match write_dev_artifacts(&output_dir) {
                Ok(paths) => {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&paths).expect("artifact paths serialize")
                    );
                    ExitCode::SUCCESS
                }
                Err(message) => {
                    eprintln!("{message}");
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

fn print_usage() {
    eprintln!("Usage:");
    eprintln!("  polana-node describe-runtime");
    eprintln!("  polana-node print-dev-spec");
    eprintln!("  polana-node describe-service-plan");
    eprintln!("  polana-node describe-launch-attempt");
    eprintln!("  polana-node run-dev");
    eprintln!("  polana-node write-dev-artifacts <output-dir>");
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn runtime_summary_lists_memory_registry() {
        let summary = runtime_summary();
        assert!(summary.pallets.iter().any(|pallet| pallet == "MemoryRegistry"));
        assert_eq!(summary.max_field_length, 256);
    }

    #[test]
    fn dev_spec_uses_expected_chain_id() {
        let spec = dev_chain_spec_preview();
        assert_eq!(spec.id, "polana-dev");
        assert_eq!(spec.protocol_id, "polana");
    }

    #[test]
    fn write_dev_artifacts_emits_expected_files() {
        let temp_dir = tempfile::tempdir().expect("temp dir should exist");
        let output =
            write_dev_artifacts(temp_dir.path().to_str().expect("temp path should be valid"))
                .expect("artifacts should write");

        let runtime_summary = output
            .get("runtime_summary")
            .and_then(|value| value.as_str())
            .expect("runtime_summary path should exist");
        assert!(Path::new(runtime_summary).exists());

        let service_plan = output
            .get("node_service_plan")
            .and_then(|value| value.as_str())
            .expect("node_service_plan path should exist");
        assert!(Path::new(service_plan).exists());

        let launch_attempt = output
            .get("service_launch_attempt")
            .and_then(|value| value.as_str())
            .expect("service_launch_attempt path should exist");
        assert!(Path::new(launch_attempt).exists());
    }

    #[test]
    fn run_dev_service_reports_missing_components() {
        let attempt = service::try_run_dev_service().expect_err("service should not be wired yet");
        assert_eq!(attempt.status, "service-not-wired");
        assert!(!attempt.missing_components.is_empty());
    }
}
