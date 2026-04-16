# Memory Object Schema

This document defines the first canonical JSON shape for the Polana lightweight core.

The authoritative machine-readable schema is:

- [memory-object.schema.json](./memory-object.schema.json)
- [binding-object.schema.json](./binding-object.schema.json)

## Design Principles

- the schema must be deterministic enough to hash consistently
- raw payloads stay in content-addressed storage, not in the ledger
- sensitive context should be referenced by hash, not copied inline
- chain anchors are optional extensions, not required fields
- the first schema should be narrow and stable rather than exhaustive

## Top-Level Structure

The memory object is organized into a few stable sections:

- `content`: where the payload lives and how it is encoded
- `provenance`: how the artifact was produced
- `producer`: who or what produced it
- `ownership`: who controls it
- `integrity`: the canonical hash and optional signature
- `timestamps`: creation and recording times
- `policy`: visibility and retention rules
- `attestations`, `anchors`, `relations`, `tags`: optional extensions

## Required Fields

These fields are mandatory in `v1.0.0`:

- `schema_version`
- `memory_id`
- `content`
- `provenance`
- `producer`
- `ownership`
- `integrity`
- `timestamps`

This keeps the first implementation focused on identity, storage, and verification.

## Field Notes

### `memory_id`

This is the protocol identifier, separate from storage CIDs and ledger row IDs.

Recommended rule:

- prefix with `mem_`
- derive from canonical hash plus namespace-safe encoding
- keep it stable across storage backends

### `content`

This section points to the stored bundle, not the full bundle itself.

For MVP it should include:

- `cid`
- `media_type`
- `encoding`
- `size_bytes`

Optional encryption metadata is allowed, but the schema does not force encryption in every case.

### `provenance`

This section records how the memory object came into existence.

Important rule:

- use `prompt_hash`, `context_hash`, and `tool_trace_hash` instead of dumping raw private inputs into the protocol object

### `producer`

This identifies the producing actor.

Examples:

- an AI agent instance
- an application service
- an organization-controlled runtime
- a human reviewer in hybrid workflows

Important rule:

- `producer_id` should be a Polana-native ID such as `prod_*`
- it should not be an EVM address, Solana pubkey, or SS58 address
- external wallet or chain addresses should be attached through binding objects

### `ownership`

This is distinct from the producer. A model may produce a memory object while a user or organization owns it.

Important rule:

- `owner_id` should be a Polana-native ID such as `own_*`
- external account systems belong in binding objects, not as the root owner identifier

### `integrity`

This section is the verification center of the object.

Required:

- `canonical_hash`
- `hash_algorithm`

Optional:

- `signature`
- `merkle_root`

### `timestamps`

`created_at` is required because the object needs a minimum temporal claim even before any external anchor exists.

Recommended interpretation:

- `created_at`: when the app says the artifact was produced
- `recorded_at`: when the ledger persisted the record

### `policy`

This is optional in the schema, but most real deployments should include it.

If omitted in MVP, the ingestion layer should apply a default policy outside the object or inject one before finalization.

## Example Object

```json
{
  "schema_version": "1.0.0",
  "memory_id": "mem_01JQ9X8P0NZ6Y2D8W0B2T7R4KA",
  "content": {
    "cid": "bafybeigdyrzt5examplecidvalue123456789",
    "media_type": "application/json",
    "encoding": "json",
    "size_bytes": 1824,
    "payload_summary": {
      "kind": "response",
      "preview": "Final answer explaining the recommendation and tradeoffs."
    }
  },
  "provenance": {
    "model_name": "gpt-5.4",
    "model_version": "2026-04",
    "provider": "openai",
    "prompt_hash": "8f91fb3c5902f54e7a0f84f2bb7d6d0b19fb7a5054e0f9fdc7b4f6e7562d9a2a",
    "context_hash": "9e80dcfca1286f2b4de1f6e7b8db8e36f496e2a02fef93dbf6f6c553ccce8821",
    "output_schema_version": "1.0.0",
    "agent_runtime_version": "codex-desktop-1.2.0"
  },
  "producer": {
    "producer_id": "prod_01jq9x8p0nz6y2d8w0b2t7r4kb",
    "producer_type": "agent",
    "display_name": "Polana Demo Agent"
  },
  "ownership": {
    "owner_id": "own_01jq9x8p0nz6y2d8w0b2t7r4kc",
    "owner_type": "organization",
    "transferable": false
  },
  "integrity": {
    "canonical_hash": "eb4c1f0d0a6d4137140f5f1cc8b8d4f2ca54f3a8a86ec7a8fdc303b6cc6f4a2d",
    "hash_algorithm": "sha256"
  },
  "timestamps": {
    "created_at": "2026-04-12T08:30:00Z",
    "recorded_at": "2026-04-12T08:30:02Z",
    "source_clock": "ledger"
  },
  "policy": {
    "policy_id": "default-public-v1",
    "visibility": "public",
    "retention": "permanent"
  },
  "tags": [
    "ai-response",
    "design"
  ]
}
```

## Canonicalization Guidance

The schema alone does not guarantee deterministic hashing. The implementation should also define:

- a canonical serialization format
- key ordering rules
- null handling rules
- array ordering rules for optional collections
- UTF-8 normalization rules

Without that, two valid objects could still hash differently.

## Recommended Next Step

After this schema, the next artifact should be a short canonicalization spec such as:

- required field ordering for serialization
- how `memory_id` is derived
- which fields are included in `canonical_hash`
- whether signatures cover the full object or a reduced signing payload

That spec now lives here:

- [Canonicalization Spec](./canonicalization.md)
- [Address Model](./address-model.md)
- [Versioning Policy](./versioning-policy.md)
