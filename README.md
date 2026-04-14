# Polana

Polana is an AI footprint protocol for recording model outputs, agent actions, and provenance as durable, verifiable, and portable memory objects.

The first version is a lightweight core, not a multi-chain bridge.

- `Core` creates canonical memory objects
- `Storage` persists raw payloads in content-addressed form
- `Verification` proves integrity, provenance, and authorship
- `Anchors` are optional extensions for later chain integration

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
- `rust/polana-submitter`: offchain CLI to verify memory objects and prepare pallet anchor payloads

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
- [Substrate Pallet Sketch](./docs/substrate-pallet.md)
