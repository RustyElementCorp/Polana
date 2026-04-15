# Relayer Sketch

This document describes the first relay path between Chain A and Chain B.

Implemented crate:

- [rust/polana-relayer](/Users/degikwag/code/llm/Polana/rust/polana-relayer)

## 1. Role

The relayer is the translation path between:

- Chain A anchor semantics
- Chain B mirror semantics

It should not invent new protocol data. It should only transform verified core artifacts into chain-specific calls.

## 2. First Responsibility

The first responsibility is narrow:

- read a validated memory object
- extract `AnchorPayload`
- derive the Solana `UpsertMemory` instruction

This keeps the first relayer deterministic and auditable.

## 3. Current CLI

Current commands:

- `polana-relayer preview <memory-object.json>`
- `polana-relayer relay-memory <memory-object.json> <mirror-sink.jsonl> <checkpoint.json>`
- `polana-relayer preview-anchor <anchor-payload.json>`
- `polana-relayer relay-anchor-source <anchor-source.jsonl> <mirror-sink.jsonl> <checkpoint.json>`
- `polana-relayer poll-substrate-once <substrate-config.json> <mirror-sink.jsonl> <checkpoint.json>`

Output:

- anchor payload
- Solana mirror instruction
- Borsh-encoded instruction bytes as hex
- replay-safe sink append outcome for local relay runs

## 4. Local Relay Pipeline

Before RPC integration, the relayer now has a minimal executable pipeline:

- `memory-object.json` as source input
- `anchor-source.jsonl` as a Chain A event-source stand-in
- `checkpoint.json` for replay protection
- `mirror-sink.jsonl` as the local Solana-side instruction sink

This gives the project a deterministic local path for:

- converting memory objects into Solana mirror instructions
- consuming anchor payload streams without direct chain dependencies
- skipping duplicate `memory_id` values
- preserving an append-only relay trail for inspection and tests

## 5. Why This Matters

This proves that the two-chain system already shares a clean bridge surface:

- `polana-core` defines the shared anchor payload
- `pallet-memory-registry` stores the Chain A anchor
- `solana-memory-mirror` defines the Chain B mirror instruction
- `polana-relayer` joins them without altering memory semantics
- replay protection can be tested before real chain RPC is added

The relayer boundary is now explicit:

- `AnchorSource`
  current local implementation: JSONL anchor payload source
- `MirrorSink`
  current local implementation: JSONL Solana instruction sink

Current chain-adapter scaffolds also exist:

- `SubstrateAnchorSourceConfig`
  future input from pallet events or storage polling
- `SolanaRpcMirrorSinkConfig`
  output to a Solana transaction preview / outbox path, and later RPC submission

The Solana sink now builds a transaction preview with:

- `program_id`
- authority and mirror account metas
- Borsh-encoded instruction data
- optional JSONL outbox persistence
- optional offline signed transaction preview via `recent_blockhash_override`
- optional `sendTransaction` JSON-RPC request emission and submission

This means the Solana path now supports:

1. instruction preview
2. signed transaction construction
3. JSON-RPC request construction
4. optional RPC submission

This is the handoff point for later:

- Substrate event / storage polling as `AnchorSource`
- Solana transaction submission as `MirrorSink`

## 6. Substrate Read Path

The current pallet event is not enough by itself to produce the Chain B mirror payload.

`MemoryRegistered` emits:

- `memory_id`
- `canonical_hash_hex`
- `submitter`

But the Solana mirror also needs:

- `content_cid`
- `producer_id`
- `policy_id`

So the real Substrate relay path is:

1. observe `MemoryRegistered`
2. read the full anchor from registry storage using `memory_id`
3. verify the storage record matches the event
4. produce `AnchorEnvelope`

The relayer now encodes that assumption in code with:

- `SubstrateMemoryRegisteredEvent`
- `SubstrateRegistryAnchor`
- `anchor_envelope_from_substrate_event(...)`

It also defines the polling contract needed for real RPC integration:

- `SubstrateAnchorClient::fetch_memory_registered_events(...)`
- `SubstrateAnchorClient::fetch_registry_anchor(...)`
- `SubxtSubstrateAnchorClient::poll_source_once(...)`

`SubstrateAnchorSource::poll_once(...)` now consumes that client contract and builds a replayable local source.
That means the remaining work for Substrate is mostly transport implementation, not relay semantics.

The live `subxt` path now follows the same contract:

1. connect to the configured websocket endpoint
2. stream finalized blocks
3. decode `MemoryRegistered` event fields from raw event bytes
4. fetch the full anchor from the configured storage entry
5. build a local `SubstrateAnchorSource`

Minimal config example:

```json
{
  "chain_name": "polana-dev",
  "ws_url": "ws://127.0.0.1:9944",
  "pallet_name": "MemoryRegistry",
  "event_name": "MemoryRegistered",
  "storage_entry_name": "Anchors",
  "start_block": 1
}
```

Minimal Solana sink config shape:

```json
{
  "rpc_url": "http://127.0.0.1:8899",
  "program_id": "11111111111111111111111111111111",
  "authority_keypair_path": "/tmp/authority.json",
  "authority_pubkey": "11111111111111111111111111111111",
  "mirror_account_pubkey": "11111111111111111111111111111111",
  "outbox_path": "/tmp/polana-solana-outbox.jsonl",
  "recent_blockhash_override": "11111111111111111111111111111111",
  "submit_rpc": false
}
```

## 7. Next Steps

1. implement Substrate-backed `AnchorSource`
2. implement Solana RPC-backed `MirrorSink`
3. persist stronger checkpoints than `memory_id` only
4. add end-to-end event-to-instruction integration tests
