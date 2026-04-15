# Solana Chain B Sketch

This document defines the first intended Solana-side role in Polana's dual-chain architecture.

Implemented crate:

- [rust/solana-memory-mirror](/Users/degikwag/code/llm/Polana/rust/solana-memory-mirror)

## 1. Role Of Solana In Polana

Solana is not the primary canonical registry.

Its role is to act as the `access / consumption chain`.

That means:

- memory objects are first-class application resources
- selected fields are mirrored into Solana accounts
- downstream applications can read or act on mirrored memory state quickly

The authoritative memory semantics still come from the shared core.

## 2. What Gets Mirrored

The first mirror should stay compact.

Mirrored fields:

- `memory_id`
- `canonical_hash_hex`
- `content_cid`
- `producer_id`
- `policy_id`
- `consumption_status`

Not mirrored in the first version:

- full provenance envelope
- full signature bundle
- raw payload content

## 3. Account Model

Primary account:

- `MemoryMirrorAccount`

Fields:

- `version`
- `authority`
- `memory_id`
- `canonical_hash_hex`
- `content_cid`
- `producer_id`
- `policy_id`
- `consumption_status`

This is intentionally smaller than the full memory object.

## 4. Instruction Surface

Initial instructions:

- `UpsertMemory`
- `SetConsumptionStatus`

### `UpsertMemory`

Creates or updates a mirrored memory account from an already verified anchor payload.

Expected use:

- relayer reads a validated Polana memory object
- relayer or operator writes a compact mirror into Solana

### `SetConsumptionStatus`

Marks the mirrored object for downstream lifecycle state.

Possible future uses:

- available
- consumed
- licensed
- archived

## 5. Why This Shape

This preserves the intended chain split:

- Substrate chain handles registry uniqueness and anchor semantics
- Solana handles downstream access and application-facing state

It avoids overloading Solana with primary registry logic too early.

## 6. Near-Term Implementation Plan

1. define Solana-side account and instruction schema
2. add serialization and state-transition tests
3. define relayer payload mapping from `AnchorPayload`
4. add actual program processor and account validation
5. connect submitter or relayer flow after Chain A events are available

## 7. Current Status

The repository currently contains:

- state and instruction schema
- anchor payload to instruction mapping
- mirror state transition logic
- no relayer bridge yet

This is enough to lock the interface before full Solana program implementation.
