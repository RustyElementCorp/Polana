# Canonicalization Spec

This document defines how a Polana memory object is converted into a deterministic byte sequence for hashing, signing, and `memory_id` derivation.

Without this spec, two valid objects could produce different hashes. The schema defines shape. This spec defines identity.

## 1. Scope

This `v1.0.0` spec covers:

- canonical serialization
- field inclusion and exclusion rules
- object and array ordering rules
- hash generation
- `memory_id` derivation
- signing payload rules

It does not yet define:

- merkle chunking for large bundles
- partial disclosure proofs
- zk-friendly encodings

Related version policy:

- [Versioning Policy](./versioning-policy.md)

## 2. Canonical Serialization Format

The canonical serialization format for `v1.0.0` is:

- UTF-8 encoded JSON
- no insignificant whitespace
- object keys sorted lexicographically by Unicode code point
- arrays preserved in declared semantic order unless a field-specific ordering rule says otherwise
- strings preserved exactly as provided after Unicode NFC normalization
- numbers serialized in standard JSON number form with no superfluous trailing zeros

Implementation note:

- use a stable JSON canonicalizer rather than ordinary `JSON.stringify`

## 3. Input Object Requirements

Before canonicalization, the input object must:

- validate against [memory-object.schema.json](./memory-object.schema.json)
- omit unknown fields
- omit fields with `null` values
- omit optional empty objects
- permit empty arrays only where semantically meaningful

For `v1.0.0`, producers should prefer omission over explicit empties for optional fields.

## 4. Hash Surfaces

Polana uses three distinct identity surfaces:

1. `content payload`
2. `memory object`
3. `signing payload`

These surfaces are related but not identical.

## 5. Content Payload Hash

The content payload hash represents the stored raw bundle.

### Included

- exact bytes of the stored payload artifact

### Excluded

- all ledger metadata
- all external anchors
- all transport metadata

### Output

- stored as `integrity.canonical_hash` only if the protocol treats the content bundle itself as the primary canonical object

For the first Polana implementation, the recommended approach is:

- store the canonical memory object as the content payload
- hash those exact bytes

That keeps the first MVP simple.

## 6. Canonical Memory Object Hash

The canonical memory object hash is the protocol identity root for verification and `memory_id` derivation.

### Included Top-Level Fields

- `schema_version`
- `content`
- `provenance`
- `producer`
- `ownership`
- `timestamps`
- `policy`
- `attestations`
- `tags`
- `relations`

### Excluded Top-Level Fields

- `memory_id`
- `integrity`
- `anchors`

Rationale:

- `memory_id` cannot hash itself
- `integrity` contains the hash result and optional signature
- `anchors` are post-creation side effects and must not change object identity

## 7. Field-Specific Rules

### 7.1 Object Keys

Every object is serialized with keys sorted lexicographically.

Example:

```json
{"a":1,"b":2}
```

not:

```json
{"b":2,"a":1}
```

### 7.2 Optional Fields

If an optional field is absent, it is omitted entirely.

Do not serialize:

- `null`
- empty strings used as placeholders
- empty objects that carry no semantics

### 7.3 Arrays

Arrays are treated in one of two ways.

Preserve input order:

- `input_refs`
- `attestations`
- `relations`

Sort lexicographically before serialization:

- `tags`

Reason:

- `input_refs`, `attestations`, and `relations` may encode timeline or semantic sequence
- `tags` are labels and should not change identity due to insertion order

### 7.4 Strings

All strings must be normalized with Unicode NFC before serialization.

This prevents visually identical strings from hashing differently due to Unicode composition variance.

### 7.5 Timestamps

All timestamps must:

- use RFC 3339 / ISO 8601 UTC form
- include a trailing `Z`
- include seconds

Preferred example:

- `2026-04-12T08:30:02Z`

Avoid local offsets in canonical objects.

## 8. Canonical Hash Algorithm

The default hash algorithm for `v1.0.0` is:

- `sha256`

Hash procedure:

1. Build the reduced canonical object by removing excluded fields.
2. Normalize strings and arrays according to this spec.
3. Serialize to canonical JSON.
4. Encode as UTF-8 bytes.
5. Compute SHA-256 over those bytes.
6. Encode output as lowercase hexadecimal.

The result is written to:

- `integrity.canonical_hash`
- `integrity.hash_algorithm`

## 9. `memory_id` Derivation

`memory_id` is derived from the canonical hash, not generated randomly.

`v1.0.0` rule:

1. Compute the canonical hash.
2. Take the full hash bytes.
3. Encode with base32 lowercase without padding, or another fixed namespace-safe encoding chosen by implementation.
4. Prefix with `mem_`.

Example form:

- `mem_f4k2x7...`

Constraint:

- every implementation in the same network environment must use the same encoding rule

If the project prefers ULID-style identifiers later, that must be a versioned change because it alters determinism guarantees.

## 10. Signing Payload

The signing payload is not always the full memory object.

For `v1.0.0`, the recommended signing payload is the same reduced canonical object used for hashing.

### Included

- all fields included in the canonical memory object hash

### Excluded

- `memory_id`
- `integrity.signature`
- `anchors`

Signing flow:

1. Construct reduced canonical object.
2. Serialize canonically.
3. Hash if required by signing algorithm.
4. Sign with producer key.
5. Write the signature into `integrity.signature`.

## 11. Example Reduced Hash Object

Given this logical memory object:

```json
{
  "schema_version": "1.0.0",
  "memory_id": "mem_placeholder",
  "content": {
    "cid": "bafyexample",
    "media_type": "application/json",
    "encoding": "json",
    "size_bytes": 100
  },
  "provenance": {
    "model_name": "gpt-5.4",
    "provider": "openai",
    "output_schema_version": "1.0.0"
  },
  "producer": {
    "producer_id": "agent:demo",
    "producer_type": "agent"
  },
  "ownership": {
    "owner_id": "org:demo",
    "owner_type": "organization"
  },
  "timestamps": {
    "created_at": "2026-04-12T08:30:00Z"
  },
  "integrity": {
    "canonical_hash": "placeholder",
    "hash_algorithm": "sha256"
  },
  "tags": [
    "design",
    "ai-response"
  ],
  "anchors": [
    {
      "system": "polkadot",
      "ref": "123"
    }
  ]
}
```

The reduced canonical object becomes:

```json
{"content":{"cid":"bafyexample","encoding":"json","media_type":"application/json","size_bytes":100},"ownership":{"owner_id":"org:demo","owner_type":"organization"},"producer":{"producer_id":"agent:demo","producer_type":"agent"},"provenance":{"model_name":"gpt-5.4","output_schema_version":"1.0.0","provider":"openai"},"schema_version":"1.0.0","tags":["ai-response","design"],"timestamps":{"created_at":"2026-04-12T08:30:00Z"}}
```

Notes:

- `memory_id` is removed
- `integrity` is removed
- `anchors` are removed
- `tags` are sorted lexicographically
- keys are lexicographically ordered in every object

## 12. Compatibility Rules

The canonicalization spec is part of protocol identity. Any of the following require a schema or canonicalization version bump:

- changing included or excluded fields
- changing array ordering rules
- changing string normalization rules
- changing hash algorithm defaults
- changing `memory_id` encoding rules

Do not silently change canonicalization behavior in application code.

## 13. Recommended Implementation Sequence

1. Validate object against the JSON schema.
2. Build the reduced canonical object.
3. Apply field normalization.
4. Serialize to canonical JSON.
5. Compute hash.
6. Derive `memory_id`.
7. Optionally sign.
8. Persist content and ledger entry.
