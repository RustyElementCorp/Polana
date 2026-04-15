# Polana

Polana is an AI footprint protocol for recording model outputs, agent actions, and provenance as durable, verifiable, and portable memory objects.

The current direction is a dual-chain strategy built on top of a chain-agnostic memory core.

- `Core` creates canonical memory objects
- `Storage` persists raw payloads in content-addressed form
- `Verification` proves integrity, provenance, and authorship
- `Anchors` connect the core to more than one onchain environment

## Current Workspace

The repository now includes the first protocol code skeleton:

- `packages/memory-schema`: TypeScript types and structural validation
- `packages/hashing`: canonicalization, hashing, and `memory_id` derivation
- `packages/signer`: ed25519 signing and verification
- `packages/storage-client`: local content-addressed storage adapter
- `packages/ledger`: append-only JSONL ledger
- `packages/sdk`: create, record, and verify flow
- `apps/demo-cli`: runnable local demo for create and verify
- `apps/ingestion-api`: HTTP entrypoint for memory ingestion and verification
- `rust/polana-core`: Rust reference core for canonicalization and signature verification
- `rust/pallet-memory-registry`: Substrate pallet skeleton for onchain memory anchors
- `rust/polana-node`: minimal node packaging skeleton around the runtime
- `rust/polana-runtime`: minimal Substrate runtime skeleton that composes the memory registry pallet
- `rust/polana-submitter`: offchain CLI to verify memory objects and prepare pallet anchor payloads
- `rust/solana-memory-mirror`: Solana-side state and instruction skeleton for Chain B
- `rust/polana-relayer`: local replay-safe relayer from memory objects to Solana mirror instruction records

## Chain Direction

Polana is currently being shaped as:

- `vanilla core`
  chain-agnostic memory protocol logic that can live as its own project boundary
- `chain A`
  a Substrate-compatible anchor layer for fast ecosystem onboarding
- `chain B`
  a second chain integration for parallel access, settlement, or consumption

This means the current Substrate work is intentional, but it is not the whole product.

## Demo

Build everything:

```bash
npx tsc -b
```

Create a demo memory object:

```bash
node ./apps/demo-cli/dist/index.js create-demo
```

Verify the most recent demo memory object:

```bash
node ./apps/demo-cli/dist/index.js verify
```

Start the local ingestion API:

```bash
node ./apps/ingestion-api/dist/index.js
```

Run the reference-core test suite:

```bash
npm test
```

Run the local relayer preview:

```bash
cargo run -p polana-relayer -- preview tests/fixtures/golden-memory-object.json
```

Relay one memory object into the local mirror sink with checkpointing:

```bash
cargo run -p polana-relayer -- relay-memory tests/fixtures/golden-memory-object.json /tmp/polana-relay-sink.jsonl /tmp/polana-relay-checkpoint.json
```

Relay a JSONL anchor source into the local mirror sink:

```bash
cargo run -p polana-relayer -- relay-anchor-source /tmp/polana-anchor-source.jsonl /tmp/polana-relay-sink.jsonl /tmp/polana-relay-checkpoint.json
```

Poll a live Substrate node once and relay the first matching anchor batch:

```bash
cargo run -p polana-relayer -- poll-substrate-once /tmp/polana-substrate-config.json /tmp/polana-relay-sink.jsonl /tmp/polana-relay-checkpoint.json
```

Write a local dev artifact bundle for runtime, chain, launch, and relayer configs:

```bash
cargo run -p polana-node -- write-dev-artifacts /tmp/polana-devnet
```

Inspect the current node service plan without trying to launch:

```bash
cargo run -p polana-node -- describe-service-plan
```

The Solana sink can now build transaction previews and persist them to a JSONL outbox via `SolanaRpcMirrorSinkConfig.outbox_path`.
It can also build signed transaction previews offline with `recent_blockhash_override`, and optionally submit `sendTransaction` requests when `submit_rpc` is enabled.

## Core Idea

An AI response should not disappear after generation. It should become a memory object with:

- immutable content addressing
- signed provenance metadata
- verifiable timestamps and ownership metadata
- portable references across apps, chains, and organizations

This is the first step toward treating AI footprints as persistent, attributable, and eventually institution-like digital entities.

## Design Docs

- [Architecture](./docs/architecture.md)
- [Memory Object Schema](./docs/schema.md)
- [Canonicalization Spec](./docs/canonicalization.md)
- [Storage Adapter Interface](./docs/storage-adapters.md)
- [Dual-Chain Strategy](./docs/dual-chain-strategy.md)
- [Chain B Evaluation](./docs/chain-b-evaluation.md)
- [Relayer Sketch](./docs/relayer.md)
- [Node Skeleton](./docs/node-skeleton.md)
- [Runtime Skeleton](./docs/runtime-skeleton.md)
- [Local E2E Plan](./docs/e2e-local.md)
- [Solana Chain B Sketch](./docs/solana-chain-b.md)
- [Substrate Pallet Sketch](./docs/substrate-pallet.md)
