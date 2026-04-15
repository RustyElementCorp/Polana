# Node Skeleton

This repo now includes a minimal node crate:

- [rust/polana-node](/Users/degikwag/code/llm/Polana/rust/polana-node)

## Goal

This is not yet a full Substrate service binary.

It does three narrower jobs:

- link against `polana-runtime`
- define a dev chain preview shape
- define the CLI surface that a future real node binary should preserve

## Current Commands

- `polana-node describe-runtime`
- `polana-node print-dev-spec`
- `polana-node describe-service-plan`
- `polana-node describe-launch-attempt`
- `polana-node run-dev`
- `polana-node write-dev-artifacts <output-dir>`

## Current Behavior

- `describe-runtime`
  prints the current runtime summary
- `print-dev-spec`
  prints a dev chain preview JSON
- `describe-service-plan`
  prints the current service wiring plan, required crates, and expected binaries
- `describe-launch-attempt`
  prints the current non-wired launch attempt shape without trying to boot anything
- `run-dev`
  prints the intended local launch config and exits with a non-zero status
- `write-dev-artifacts`
  writes runtime, chain, launch, and relayer config JSON files into one directory
  and now also writes `node-service-plan.json` and `service-launch-attempt.json`

Those commands are intentional. They keep the launch contract visible before the full service stack is added.
The artifact writer exists to make local devnet setup reproducible even before the real node service is wired in.
`run-dev` now also prints the current launch attempt so the missing service layer is explicit, not implicit.

## Why This Matters

The project now has explicit crates for:

1. protocol core
2. pallet
3. runtime
4. relayer
5. node packaging boundary

That makes the remaining gap very specific:

- integrate a real Substrate service stack
- wire `polana-runtime` into it
- make `run-dev` actually launch

## Next Steps

1. add a service-backed node crate or adapt a node template
2. emit real chain metadata from the node/runtime build
3. connect local node startup to the E2E guide
