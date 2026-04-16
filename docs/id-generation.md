# Polana ID Generation v0

This document defines the initial generation rules for the core-native IDs used by Polana.

The purpose of this document is to lock the first stable rules for:

- `prod_*`
- `own_*`
- `bind_*`
- `att_*`
- `anch_*`

These are core IDs.
They are not raw wallet addresses, chain accounts, or external storage keys.

## 1. Design Constraints

The generation rules should satisfy these constraints:

- stable across storage backends and chain adapters
- independent from Solana, EVM, Substrate, DID, or app-local account formats
- simple enough to implement in both TypeScript and Rust
- hard to confuse with external addresses
- explicit enough to version later

## 2. Initial Strategy

For `v0`, Polana should use opaque, random-looking IDs for `prod_*`, `own_*`, `bind_*`, `att_*`, and `anch_*`.

That is the safest starting point because:

- these IDs represent long-lived identity objects
- they should not change when external address bindings change
- they should not leak external account structure or derivation secrets
- they do not need deterministic reconstruction from third-party addresses

This is different from `memory_id`, which is already derived from canonical object content.

## 3. Canonical Shape

Every generated ID should follow this structure:

```text
<prefix>_<body>
```

Examples:

- `prod_...`
- `own_...`
- `bind_...`
- `att_...`
- `anch_...`

Rules:

- the prefix must be lowercase ASCII
- the separator must be a single underscore
- the body must be lowercase alphanumeric only
- no mixed-case encodings
- no punctuation after the underscore

## 4. Body Encoding

For `v0`, the body should be:

- generated from at least 128 bits of entropy
- encoded as lowercase base32 without padding, or another lowercase-safe alphabet already used by the protocol

Target properties:

- copy/paste safe
- URL safe
- filesystem safe
- easy to validate with simple regex

Recommended minimum body length:

- `26` characters when using a 128-bit lowercase base32 encoding

Longer bodies are acceptable if the same scheme is used consistently.

## 5. Prefix Rules

### `prod_*`

Used for a producer identity:

- agent
- app runtime
- organization-controlled service
- human or hybrid producer identity

Generation rule:

- assign once at producer identity creation
- never regenerate just because the producer adds a new chain or wallet binding
- rotate only if a new Polana producer identity is intentionally created

### `own_*`

Used for an owner or controller identity:

- user
- organization
- team
- application account

Generation rule:

- assign once when the owner identity is first created in Polana
- keep stable even if external custody or wallet bindings change
- never derive directly from an EVM, Solana, or SS58 address

### `bind_*`

Used for a single binding object between one Polana subject and one external address representation.

Generation rule:

- assign once per binding object
- creating a second address binding should create a second `bind_*`
- changing verification state does not change `bind_*`
- replacing the external address should usually create a new binding object, not mutate the old one silently

### `att_*`

Used for protocol-level attestation identities:

- producer signature evidence
- human review evidence
- enterprise approval records
- compliance or execution attestations

Generation rule:

- assign once per attestation object
- keep stable for the life of that attestation
- never derive directly from a signer public key or third-party approval system identifier

### `anch_*`

Used for protocol-level anchor identities:

- local anchor references
- onchain anchor records
- cross-registry publication references

Generation rule:

- assign once per anchor object
- treat anchor state transitions as state changes on the same anchor where possible
- if a new external anchor is created in a different registry or namespace, create a new `anch_*`

## 6. What Must Not Happen

The protocol should not do any of the following for `v0`:

- set `prod_*` equal to a Solana public key
- set `own_*` equal to an EVM address
- derive `bind_*` by hashing only the external address with no namespace or subject context
- set `att_*` equal to a signature value or approval ticket id
- set `anch_*` equal to a raw transaction hash or chain event id
- reuse the same body across different prefixes and treat them as interchangeable
- infer core identity by parsing an external address format

## 7. Deterministic Derivation Policy

For `v0`, `prod_*`, `own_*`, and `bind_*` should not depend on deterministic external wallet derivation.

Deterministic derivation belongs in binding metadata:

- `external_ref.scheme`
- optional binding provenance
- optional verification evidence

This separation is critical because external derivation policy may evolve over time.

## 8. Suggested Validation Patterns

Suggested regex patterns:

- `prod_*`: `^prod_[a-z0-9]{20,64}$`
- `own_*`: `^own_[a-z0-9]{20,64}$`
- `bind_*`: `^bind_[a-z0-9]{20,64}$`
- `att_*`: `^att_[a-z0-9]{20,64}$`
- `anch_*`: `^anch_[a-z0-9]{20,64}$`

These ranges leave room for a future scheme update without making the format loose.

## 9. Versioning Rule

The generation scheme itself should be versioned conceptually as:

- `core-id-v1`

If Polana later changes encoding, entropy source, or ID body construction, it should:

- define `core-id-v2`
- keep old IDs valid
- avoid rewriting existing stored objects

## 10. Implementation Guidance

TypeScript and Rust implementations should:

- share the same prefix constants
- share the same validation rules
- share the same fixture vectors for sample generated IDs

What they do not need to share is a deterministic generator seed.
Random generation is acceptable as long as the output format is the same.

## 11. Recommended Immediate Follow-Up

The next implementation step should add:

- ID generation helpers in TS
- ID generation helpers in Rust
- validation helpers for `prod_*`, `own_*`, `bind_*`, `att_*`, and `anch_*`
- fixture examples proving both runtimes accept the same format
