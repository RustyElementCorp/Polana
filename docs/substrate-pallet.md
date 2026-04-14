# Substrate Pallet Sketch

This document describes the first onchain anchor layer for Polana.

Implemented crate:

- [rust/pallet-memory-registry](/Users/degikwag/code/llm/Polana/rust/pallet-memory-registry)

## Goal

The pallet is not a full memory runtime. It is a minimal onchain registry for memory anchors.

It stores:

- `memory_id`
- `canonical_hash_hex`
- `content_cid`
- `producer_id`
- `policy_id`
- `submitter`
- `registered_at`

It does not store:

- raw memory payload
- prompt content
- signatures
- full provenance envelope

Those stay offchain or in higher-level protocol layers.

## State Model

Primary map:

- `Anchors[memory_id] -> MemoryAnchor`

Counter:

- `MemoryCount`

## First Extrinsic

- `register_memory`

Input:

- `memory_id`
- `canonical_hash_hex`
- `content_cid`
- `producer_id`
- `policy_id`

Checks:

- `memory_id` starts with `mem_`
- hash is lowercase 64-char hex
- content CID is non-empty
- producer ID is non-empty
- memory is not already registered

## Why This Shape

This keeps the first pallet small and aligned with the protocol:

- offchain storage still holds the actual payload
- Rust core still owns canonicalization and signing
- the chain only anchors identity and metadata

## Next Steps

After this skeleton, the natural follow-ups are:

1. add FRAME mock runtime tests
2. add origin/permission policy
3. support producer public key or signature hash anchoring
4. expose query/runtime API
5. connect the Rust core builder output to pallet calls
