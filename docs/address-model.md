# Polana Address Model v0

This document defines the first core-native address and binding model for Polana.

The main rule is simple:

- Polana core identities must not depend on any single external chain or wallet format
- external addresses are absorbed through binding objects
- derivation rules are versioned so they can evolve without rewriting core identity

## 1. Goals

The address model must let Polana:

- identify memory objects and actors without depending on Substrate, Solana, or EVM
- attach one or more external addresses to the same core identity
- distinguish unverified address claims from verified bindings
- change derivation rules later without breaking existing memory objects

## 2. Core Principle

Polana uses two different kinds of identifiers:

- `core-native IDs`
- `external addresses`

They are not the same thing.

Core-native IDs define identity inside Polana.
External addresses define how that identity is represented in outside systems.

## 3. Core-Native IDs

These IDs are authoritative inside the protocol.

Recommended prefixes:

- `mem_*`: memory object
- `prod_*`: producer or agent identity
- `own_*`: owner or controller identity
- `pol_*`: policy
- `bind_*`: external address binding
- `att_*`: attestation
- `anch_*`: anchor record

Rules:

- prefixes must be stable and explicit
- IDs must be chain-agnostic
- IDs must not embed raw chain addresses as the primary identifier
- IDs may be random, derived, or hash-based depending on object type, but the scheme must be versioned

## 4. External Addresses

External addresses are references into other systems.

Examples:

- Solana public key
- EVM address
- Substrate SS58 account
- DID
- content CID
- app-local account ID

External addresses should always be carried with explicit metadata:

- `network`
- `address`
- `scheme`

Example:

```json
{
  "network": "solana",
  "address": "7abc...",
  "scheme": "solana-ed25519-v1"
}
```

This matters because `0xabc...` without context is not enough. The protocol needs to know which namespace and derivation/validation rules apply.

## 5. Binding Objects

Binding objects connect one Polana subject to one external address representation.

The binding object is the unit that says:

- who the subject is
- which external address is being claimed
- whether that claim is verified
- how it was verified

This lets one producer or owner carry multiple external addresses at once.

It also avoids making a chain address the root of identity.

## 6. Identity And Address Are Different

Polana should never treat these as equivalent:

- `owner_id = evm address`
- `producer_id = solana public key`

Instead:

- `owner_id` is a Polana-native ID
- `producer_id` is a Polana-native ID
- external addresses are attached through bindings

That separation is what keeps the core portable.

## 7. Deterministic Derivation

Some external address bindings may be derived deterministically from a seed phrase, signer seed, hardware key, or application root secret.

That is allowed, but the derivation must be modeled as a versioned binding scheme, not as the core identity rule.

Examples:

- `solana-srp-v1`
- `evm-bip44-v1`
- `substrate-sr25519-v1`

This means Polana can later support:

- a second derivation method
- a migration path
- multiple addresses for the same subject

without changing `prod_*` or `own_*`.

## 8. Verification States

Bindings should track whether they are merely claimed or actually verified.

Minimum states:

- `claimed`
- `verified`
- `revoked`

Initial lifecycle rule:

- `claimed -> verified` is valid
- `claimed -> revoked` is valid
- `verified -> revoked` is valid
- backward transitions are invalid
- `revoked` is terminal except for idempotent re-read of the same state

Possible verification methods:

- signature challenge
- onchain ownership proof
- out-of-band admin approval
- imported trust assertion

The verification method should be explicit so later systems can choose what they trust.

## 9. Memory Object Guidance

Memory objects should carry core IDs directly:

- `memory_id`
- `producer.producer_id`
- `ownership.owner_id`

They should not need raw chain addresses as required fields.

If a memory object needs to point to relevant identity bindings, it should do so by relation or reference.

Example:

```json
{
  "relations": [
    {
      "type": "producer_binding",
      "ref": "bind_01..."
    }
  ]
}
```

## 10. Versioning Rule

The address model must version:

- core ID generation scheme
- binding scheme
- verification method

This is important because address handling is hard to change later.
Versioning from the start is cheaper than migration after adoption.

## 11. Recommended Initial Policy

For `v0`:

- keep `memory_id` as the current core-native object ID
- define `producer_id` and `owner_id` as core-native IDs, not chain addresses
- represent external addresses only through binding objects
- treat deterministic derivation as `binding.scheme`
- allow multiple bindings per subject

## 12. Immediate Follow-Up

The next core artifacts should be:

- a machine-readable binding schema
- generation rules for `prod_*`, `own_*`, and `bind_*`
- verification rules for binding state transitions
- a machine-readable attestation schema

Those generation rules now live here:

- [ID Generation v0](./id-generation.md)
