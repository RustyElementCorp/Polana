# Polana Core Boundary

This document defines the operational boundary of the `vanilla core`.

The goal is simple:

- the core must run without Substrate
- the core must run without Solana
- the core must run without Filecoin or Storacha
- adapters may depend on the core, but the core must not depend on adapters

In this repository, adapters are kept nearby as `reference adapters`.
They are example implementations around the core, not the normative center of the project.
See [Reference Adapter Policy](/Users/degikwag/code/llm/Polana/docs/reference-adapters.md).

## 1. Boundary Rule

The `vanilla core` is the smallest reusable Polana surface that can do all of the following on its own:

- create protocol-valid memory objects
- create protocol-valid binding objects
- canonicalize and hash memory objects
- derive core-native IDs
- sign and verify memory objects
- store content in local content-addressed storage
- record local append-only ledger entries
- query, export, and import local bundles

If a package or crate is required for that loop, it belongs to the core.
If it exists to integrate with a chain, network, or external runtime, it is an adapter.

## 2. TypeScript Core Packages

These workspace packages are part of the core boundary:

- `packages/memory-schema`
- `packages/hashing`
- `packages/storage-client`
- `packages/ledger`
- `packages/signer`
- `packages/sdk`

These are the core-only TS build targets in [tsconfig.core.json](/Users/degikwag/code/llm/Polana/tsconfig.core.json).

## 3. Local Core Interfaces

These are not core libraries, but they are part of the local-first core surface:

- `apps/demo-cli`
- `apps/ingestion-api`

They should only depend on core packages.
They must not take direct dependencies on chain adapters.

## 4. Rust Core Crates

These Rust crates belong to the core boundary:

- `rust/polana-core`

The workspace metadata in [Cargo.toml](/Users/degikwag/code/llm/Polana/Cargo.toml) marks this explicitly as `core_members`.

## 5. Adapter Crates

These crates are outside the core boundary:

- `rust/pallet-memory-registry`
- `rust/polana-runtime`
- `rust/polana-node`
- `rust/polana-submitter`
- `rust/solana-memory-mirror`
- `rust/polana-relayer`

They may depend on `polana-core`, but `polana-core` must not depend on them.
They should be read as reference adapters, not as permanent architectural commitments.

## 6. Execution Contracts

The repository now has explicit core-only commands:

```bash
npm run core:build
npm run core:test
npm run core:test:all
```

These commands are the minimum operational proof that the core is standalone.

Their meaning is:

- `core:build`: build only TS core packages
- `core:test`: build TS core packages and run the reference local-first test suite
- `core:test:all`: run TS core tests and Rust core tests together

## 7. Dependency Rule

Allowed dependency direction:

```text
core package/crate -> core package/crate
local interface -> core package/crate
adapter -> core package/crate
```

Disallowed dependency direction:

```text
core package/crate -> adapter
core package/crate -> chain runtime
core package/crate -> external chain SDK unless it is purely local cryptographic support
```

## 8. Future Split Rule

If Polana later splits the vanilla core into its own repository, the intended extraction set is:

- `packages/memory-schema`
- `packages/hashing`
- `packages/storage-client`
- `packages/ledger`
- `packages/signer`
- `packages/sdk`
- `rust/polana-core`
- core-focused docs and fixtures

The current repository keeps adapters nearby for speed, but the logical boundary is now fixed.
