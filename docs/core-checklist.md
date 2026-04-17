# Polana Core Completion Checklist

This document defines what it means for the Polana core to be considered closed enough to stand on its own without Substrate, Solana, or any specific external storage network.

## Completion Rule

The core is considered functionally closed when it can do all of the following locally:

- create protocol-valid memory objects
- create protocol-valid binding objects
- store raw payloads in content-addressed storage
- record memory and binding entries in append-only ledgers
- verify memory integrity and signatures
- query local records
- export and import portable bundles
- expose those capabilities through a stable SDK and local interfaces

This checklist tracks that state.

## 1. Object And Schema Layer

- `done` memory object schema exists
- `done` binding object schema exists
- `done` attestation object schema exists
- `done` canonicalization rules are documented
- `done` address model is documented
- `done` ID generation rules are documented
- `done` schema evolution and migration policy is documented

## 2. Identity Layer

- `done` `memory_id` derivation is stable
- `done` `prod_*`, `own_*`, and `bind_*` validation exists in TS
- `done` `prod_*`, `own_*`, and `bind_*` validation exists in Rust
- `done` auto-generation of producer and owner IDs exists in TS create flow
- `done` binding generation exists in TS and Rust
- `done` attestation and anchor ID generation rules are documented and validated
- `done` attestation object validation exists in TS and Rust

## 3. Memory Runtime

- `done` create memory object
- `done` canonical hash generation
- `done` `memory_id` derivation
- `done` optional producer signature support
- `done` local content-addressed storage
- `done` local append-only memory ledger
- `done` memory verification flow
- `done` memory query by local fields
- `done` memory export
- `done` memory import

## 4. Binding Runtime

- `done` create binding object
- `done` binding validation
- `done` local content-addressed binding storage
- `done` local append-only binding ledger
- `done` binding query by local fields
- `done` binding export
- `done` binding import
- `done` binding verification lifecycle rules are documented and validated

## 5. Interface Layer

- `done` TS SDK exposes memory create/verify/query/export/import
- `done` TS SDK exposes binding create/query/export/import
- `done` demo CLI exposes memory create/query/export/import
- `done` demo CLI exposes binding create/query/export/import
- `done` ingestion API exposes memory create/query/export/import
- `done` ingestion API exposes binding create/query/export/import
- `done` API error shape is normalized
- `done` CLI output shape is normalized with the same strictness as the API

## 6. Cross-Implementation Confidence

- `done` TS golden fixture tests exist
- `done` Rust golden fixture tests exist
- `done` TS and Rust share the same memory golden vectors
- `done` TS and Rust share the same binding validation fixture
- `done` TS and Rust share portable import/export fixture bundles

## 7. Adapter Isolation

- `done` memory core works without Substrate
- `done` memory core works without Solana
- `done` memory core works without Filecoin/Storacha
- `done` chain adapters are structurally outside the core path
- `done` the repo boundary between `vanilla core` and adapter packages is formalized in manifests, scripts, and docs

## 8. Operational Gaps Still Open

These are the main remaining items before the core can be called tightly closed:

1. optionally split the vanilla core into its own repository or workspace later

## 9. Explicit TODOs Beyond Core Closure

These items are important, but they are no longer required for the core itself to be considered closed:

1. add attestation ledger/query/export/import runtime surfaces
2. strengthen the query/index model beyond current local field filtering
3. build richer core-backed client flows on top of the closed core

## 10. Current Status

Current practical status:

- object model: strong
- identity model: strong
- local runtime: strong
- local interfaces: strong
- versioning/migration policy: documented and enforced for bundle payloads
- TS/Rust import-export parity: strong
- clean standalone packaging boundary: strong
- future repo extraction boundary: optional

In short:

- the local-first core is already usable
- the remaining work is mostly optional extraction and packaging choices
- the current core boundary is explicit enough to stand on its own
