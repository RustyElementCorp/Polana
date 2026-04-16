# Polana Versioning Policy v0

This document defines how core versioned artifacts change over time and what must remain compatible.

The goal is to make future change possible without breaking the identity guarantees of the current core.

## 1. Versioned Surfaces

Polana currently has four versioned surfaces in the core:

1. schema version
2. canonicalization version
3. core ID generation version
4. portable bundle version

They are related, but they do not all have to change together.

## 2. General Rule

Any change that can alter any of the following must be treated as a versioned change:

- canonical hash output
- `memory_id` derivation
- binding or identity validation rules
- import/export bundle semantics
- required field set for core objects

If a change does not affect those properties, it may remain a non-versioned implementation detail.

## 3. Schema Version

The schema version governs:

- required and optional fields
- field names
- structural validation rules

For `v1.0.0`:

- memory objects use `schema_version = 1.0.0`
- binding objects use `schema_version = 1.0.0`

### Safe Change

These changes may remain compatible inside the same major schema line:

- adding a new optional field that is excluded from canonical identity
- tightening documentation without changing machine validation
- adding helper metadata outside the canonical object surface

### Breaking Change

These changes require a new schema version:

- adding a new required field
- removing an existing field
- renaming a field
- changing field meaning
- changing validation rules such that old valid objects become invalid

## 4. Canonicalization Version

The canonicalization version governs:

- field inclusion and exclusion in the reduced hash object
- object key ordering
- array ordering rules
- string normalization
- hash algorithm and encoding rules
- `memory_id` derivation from canonical hash

For the current core, this is effectively:

- `canonical-v1`

This version may be documented separately from the object schema because two schemas can, in principle, share the same canonicalization rules.

### Breaking Change

Any change that can produce a different canonical hash for the same logical input must increment the canonicalization version.

Examples:

- changing which fields are excluded from hashing
- changing tag sort rules
- changing Unicode normalization behavior
- changing `sha256` to another default hash
- changing `memory_id` encoding

## 5. Core ID Generation Version

The core ID generation version governs:

- `prod_*`
- `own_*`
- `bind_*`
- later, other opaque core-native IDs

The current conceptual version is:

- `core-id-v1`

The current rule is:

- opaque lowercase prefixed IDs
- lowercase-safe encoded body
- minimum entropy and validation constraints

### Breaking Change

These require a new core ID version:

- changing the alphabet
- changing the body construction rule
- changing required prefix semantics
- changing validation constraints so existing IDs become invalid

## 6. Portable Bundle Version

The portable bundle version governs:

- export structure
- import semantics
- whether content is inline or referenced
- what record metadata is required in exported bundles

The current implementation uses explicit bundle shapes:

- memory bundle: `{ bundle_version, record, content_body }`
- binding bundle: `{ bundle_version, record, binding_body }`

This should now be treated as:

- `bundle-v1`

### Policy

Bundle payloads must carry an explicit `bundle_version` field.
Importers must reject unsupported bundle versions.

## 7. Compatibility Rules

### Read Compatibility

The core should prefer strong read compatibility:

- newer runtimes should keep reading older valid objects where feasible
- old fixtures should remain in test coverage unless explicitly deprecated

### Write Compatibility

Writers should emit only one active core version at a time for each versioned surface.

That avoids ambiguous identity generation.

### Migration Rule

If a version changes canonical identity, old objects must not be rewritten in place.
They should remain valid historical artifacts under the old version.

## 8. What Must Be Frozen Before Wider Adoption

Before the vanilla core is split or widely reused, the project should freeze:

1. schema `1.x` compatibility rule
2. canonicalization `v1` rule
3. core ID `v1` rule
4. bundle `v1` shape

This is the minimum safe contract line.

## 9. Current Project Policy

As of now:

- `schema 1.0.0` is active
- `canonical-v1` is active
- `core-id-v1` is active
- `bundle-v1` is active and explicit in payloads

That means the biggest unfinished versioning task is:

- state compatibility promises for future `1.x` changes

## 10. Immediate Follow-Up

The next implementation/documentation tasks should be:

- add explicit `bundle_version` fields for exported memory and binding bundles
- document deprecation and migration rules for old versions
- add cross-runtime fixture bundles that prove `bundle-v1` behavior
