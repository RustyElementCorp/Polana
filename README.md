# Polana

Polana is an AI footprint protocol for recording model outputs, agent actions, and provenance as durable, verifiable, and portable memory objects.

The current direction is a dual-chain strategy built on top of a chain-agnostic memory core.

- `Core` creates canonical memory objects
- `Storage` persists raw payloads in content-addressed form
- `Verification` proves integrity, provenance, and authorship
- `Anchors` connect the core to more than one onchain environment

## Core Boundary

The `vanilla core` is now formalized as its own operational boundary.

- TS core packages live under `packages/*`
- the Rust authoritative core lives in `rust/polana-core`
- local interfaces (`apps/demo-cli`, `apps/ingestion-api`) sit on top of that core
- chain crates remain outside the core boundary as reference adapters

Core-only commands:

```bash
npm run core:build
npm run core:test
npm run core:test:all
```

## Current Workspace

The repository now includes the first protocol code skeleton:

Core packages and crates:

- `packages/memory-schema`: TypeScript types and structural validation
- `packages/hashing`: canonicalization, hashing, and `memory_id` derivation
- `packages/signer`: ed25519 signing and verification
- `packages/storage-client`: local content-addressed storage adapter
- `packages/ledger`: append-only JSONL ledger
- `packages/sdk`: create, record, and verify flow
- `rust/polana-core`: Rust reference core for canonicalization and signature verification

Core object coverage now includes:

- memory objects
- binding objects
- attestation objects

Local interfaces on top of the core:

- `apps/demo-cli`: runnable local demo for memory and binding flows
- `apps/ingestion-api`: HTTP entrypoint for local-first memory and binding flows
- `apps/core-client`: browser-facing reference client for the core-backed user flow

Chain and runtime adapters:

- `rust/pallet-memory-registry`: Substrate pallet skeleton for onchain memory anchors
- `rust/polana-node`: minimal node packaging skeleton around the runtime
- `rust/polana-runtime`: minimal Substrate runtime skeleton that composes the memory registry pallet
- `rust/polana-submitter`: offchain CLI to verify memory objects and prepare pallet anchor payloads
- `rust/solana-memory-mirror`: Solana-side state and instruction skeleton for Chain B
- `rust/polana-relayer`: local replay-safe relayer from memory objects to Solana mirror instruction records

These chain/runtime crates are kept in-repo as reference adapters.
They are concrete examples around the core, not the normative definition of Polana itself.

## Chain Direction

Polana is currently being shaped as:

- `vanilla core`
  chain-agnostic memory protocol logic that can live as its own project boundary
- `chain A`
  a Substrate-compatible anchor layer for fast ecosystem onboarding
- `chain B`
  a second chain integration for parallel access, settlement, or consumption

This means the current Substrate work is intentional, but it is not the whole product.

## Local Core

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

Start the core-backed browser client:

```bash
npm run client:start
```

Create a demo binding object:

```bash
node ./apps/demo-cli/dist/index.js create-binding-demo
```

List recorded memories:

```bash
node ./apps/demo-cli/dist/index.js list-memories
```

List recorded bindings:

```bash
node ./apps/demo-cli/dist/index.js list-bindings
```

Export the most recent memory bundle:

```bash
node ./apps/demo-cli/dist/index.js export-memory
```

Export the most recent binding bundle:

```bash
node ./apps/demo-cli/dist/index.js export-binding
```

Import a memory bundle from disk:

```bash
node ./apps/demo-cli/dist/index.js import-memory /tmp/polana-memory-bundle.json
```

Import a binding bundle from disk:

```bash
node ./apps/demo-cli/dist/index.js import-binding /tmp/polana-binding-bundle.json
```

Run the reference-core test suite:

```bash
npm test
```

Run only the formalized core surface:

```bash
npm run core:test:all
```

The local core now supports these flows for both memory objects and binding objects:

- create
- record
- query
- export
- import

The core-backed client adds a user-facing flow on top of that:

- write response text
- record a memory object
- optionally create an owner binding
- verify immediately
- export the latest memory bundle
- paste and re-import a portable bundle
- inspect the recent local timeline in the browser

CLI responses now use the same top-level envelope style as the API:

```json
{
  "ok": true,
  "command": "list-memories",
  "data": []
}
```

## Chain Adapters

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

## Local API

With the ingestion API running, the main HTTP routes are:

- `GET /health`
- `POST /memories`
- `GET /memories`
- `GET /memories/:id`
- `GET /memories/:id/verify`
- `GET /memories/:id/export`
- `POST /memories/import`
- `POST /bindings`
- `GET /bindings`
- `GET /bindings/:id`
- `GET /bindings/:id/export`
- `POST /bindings/import`

Examples:

```bash
curl -s http://127.0.0.1:8787/memories
```

```bash
curl -s http://127.0.0.1:8787/bindings
```

Error responses use a common shape:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "request body is empty"
  }
}
```

Exported bundles now include an explicit `bundle_version` field and import paths reject unsupported bundle versions.

## Core Idea

An AI response should not disappear after generation. It should become a memory object with:

- immutable content addressing
- signed provenance metadata
- verifiable timestamps and ownership metadata
- portable references across apps, chains, and organizations

This is the first step toward treating AI footprints as persistent, attributable, and eventually institution-like digital entities.

Polana core identity is intentionally separate from external chain addresses.
`memory_id`, `producer_id`, and `owner_id` are core-native IDs; Solana, EVM, Substrate, DID, and other address formats are attached through binding objects.

## Design Docs

- [Architecture](./docs/architecture.md)
- [Memory Object Schema](./docs/schema.md)
- [Attestation Object Schema](./docs/attestation-object.schema.json)
- [Address Model](./docs/address-model.md)
- [ID Generation](./docs/id-generation.md)
- [Core Checklist](./docs/core-checklist.md)
- [Core Boundary](./docs/core-boundary.md)
- [Reference Adapter Policy](./docs/reference-adapters.md)
- [Versioning Policy](./docs/versioning-policy.md)
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
