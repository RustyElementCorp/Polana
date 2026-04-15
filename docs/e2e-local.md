# Local E2E Plan

This repo now has the relay code needed for a first local end-to-end run, but it does not yet include:

- a runnable Substrate node binary
- a runnable Solana validator setup
- a deployed Solana mirror program id

So the current local E2E target is a staged run:

1. bring up a Substrate-compatible node exposing the `MemoryRegistry` pallet at `ws://127.0.0.1:9944`
2. register one or more memory anchors on that node
3. prepare a Solana sink config
4. run `polana-relayer poll-substrate-once ...`
5. inspect the generated Solana outbox JSONL

## Required Inputs

- Substrate config example:
  [polana-substrate-config.json](/Users/degikwag/code/llm/Polana/examples/polana-substrate-config.json)
- Solana sink config example:
  [polana-solana-sink.json](/Users/degikwag/code/llm/Polana/examples/polana-solana-sink.json)

## Commands

Emit a local dev artifact bundle first:

```bash
cargo run -p polana-node -- write-dev-artifacts /tmp/polana-devnet
```

This now emits:

- `runtime-summary.json`
- `dev-chain-spec.json`
- `dev-launch-config.json`
- `node-service-plan.json`
- `relayer-substrate-config.json`
- `relayer-solana-sink-config.json`

Poll Substrate once and write local mirror instruction output:

```bash
cargo run -p polana-relayer -- poll-substrate-once /tmp/polana-devnet/relayer-substrate-config.json /tmp/polana-relay-sink.jsonl /tmp/polana-relay-checkpoint.json
```

The relayer output can then be turned into a Solana-side signed transaction preview by using `SolanaRpcMirrorSinkConfig` with:

- `outbox_path`
- `recent_blockhash_override`
- `submit_rpc = false`

## What To Validate

- Substrate event is found
- registry storage lookup succeeds
- checkpoint records the mirrored `memory_id`
- Solana outbox contains:
  - transaction preview
  - signed transaction preview
  - optional RPC request preview

## Remaining Gap

The last missing step for a true local E2E demo is runtime environment packaging:

- a local Substrate node/runtime including `pallet-memory-registry`
- a local Solana deployment flow for the mirror program

Once those are added, the relayer code is already in place to bridge them.
