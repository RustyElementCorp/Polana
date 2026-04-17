# Reference Adapter Policy

This document defines how chain and runtime integrations should be interpreted inside this repository.

## 1. Policy

Polana keeps the `vanilla core` and adapter examples in the same repository.

This is intentional.

The adapters exist to do three things:

- demonstrate that the core can map into real external environments
- validate the abstraction boundary around the core
- provide concrete integration examples for future implementations

They are not the normative center of the project.

## 2. Normative vs Illustrative

The repository should be read in three layers:

### 2.1 Normative Core

These components define the protocol itself:

- `packages/memory-schema`
- `packages/hashing`
- `packages/storage-client`
- `packages/ledger`
- `packages/signer`
- `packages/sdk`
- `rust/polana-core`

If there is a conflict between an adapter and the core, the core wins.

### 2.2 Local Interfaces

These components expose the core locally for development and validation:

- `apps/demo-cli`
- `apps/ingestion-api`

They are still core-facing, not adapter-defining.

### 2.3 Reference Adapters

These components are examples of how the core may be connected to external chains or runtimes:

- `rust/pallet-memory-registry`
- `rust/polana-runtime`
- `rust/polana-node`
- `rust/polana-submitter`
- `rust/solana-memory-mirror`
- `rust/polana-relayer`

They should be treated as illustrative adapters, not as proof that Polana is permanently committed to one external stack.

## 3. Why They Stay In The Same Repository

Keeping the adapters nearby is useful because:

- the core and adapters share fixtures and examples
- abstraction leaks are easier to catch early
- the repository remains a practical implementation reference, not only a spec

This matches the intended role of the adapters:

- they are example implementations
- they validate the core boundary
- they help future builders understand the protocol

## 4. Repository Reading Rule

When interpreting the repository:

- treat the core as the protocol source of truth
- treat local interfaces as the preferred way to exercise the core
- treat chain and runtime code as reference adapters

In short:

- `core` is normative
- `apps` are local core interfaces
- `chain/runtime` crates are examples

## 5. Design Constraint

Reference adapters may extend the system around the core, but they must not redefine:

- memory object semantics
- canonicalization semantics
- core-native identity rules
- bundle format rules
- binding semantics

If an adapter requires changing those, it is evidence that the adapter boundary is wrong.

## 6. Future Rule

New adapters are welcome, but they should follow the same status:

- useful
- concrete
- testable
- non-normative

This repository therefore functions both as:

- the home of the core protocol
- and a catalog of reference adapters around it
