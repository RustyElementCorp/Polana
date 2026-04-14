# Polana Architecture

## 1. Problem Definition

AI systems generate responses, actions, and tool traces that are usually ephemeral. This makes long-term attribution, auditability, portability, and governance difficult.

Polana turns those outputs into durable memory objects:

- the raw payload is stored in content-addressed storage
- the payload hash and provenance metadata are recorded in a verifiable ledger
- the record can be verified, referenced, permissioned, and reused later

The first version is a lightweight memory kernel. Chain integrations are optional extensions, not the core product.

## 2. Product Thesis

Polana should answer four questions for every AI artifact:

1. What exactly was produced?
2. Who or what produced it?
3. When was it recorded and under which policy?
4. Can another system verify and reuse it without trusting the original platform?

## 3. System Goals

- preserve AI outputs and action traces as immutable records
- attach provenance, ownership, and verification metadata
- support portable references across applications and optional chains
- separate heavy storage from integrity and verification logic
- make the first MVP narrow enough to ship safely

## 4. Non-Goals For MVP

- full legal personhood or legal agency for AI
- generalized cross-chain message execution
- permanent storage of every token, prompt, or private context
- universal support for every model provider and every chain

## 5. Lightweight Core Architecture

```text
AI App / Agent
    |
    v
Memory Object Builder
    |
    +--> Canonical Serializer / Hasher
    |      - deterministic payload
    |      - provenance envelope
    |      - object hash
    |
    +--> Storage Adapter
    |      - local object store
    |      - Filecoin / Storacha later
    |      - CID or content key
    |
    +--> Verification Ledger
    |      - object hash
    |      - producer identity
    |      - timestamps
    |      - policy refs
    |
    +--> Optional Anchor Adapters
           - Polkadot later
           - Solana later
           - other registries later
```

## 6. Layer Responsibilities

### 6.1 Memory Core

Defines the protocol-level object that every client must build the same way.

Responsibilities:

- canonical serialization
- deterministic hashing
- schema versioning
- provenance envelope assembly
- object ID derivation

Why it exists:

- this is the actual protocol IP
- every later storage or chain integration depends on stable object rules
- it keeps the project coherent before infrastructure expands

### 6.2 Storage Layer

Stores the full memory payload off the critical verification path.

Responsibilities:

- persist serialized memory bundles
- return content-addressed pointers
- support retrieval by CID or object key
- support encrypted payload mode later

MVP options:

- local object store for development
- IPFS-compatible storage
- Filecoin / Storacha as the preferred durable backend later

### 6.3 Verification Ledger

Stores just enough information to prove an object existed in a certain form under a claimed producer.

Responsibilities:

- register memory IDs
- bind memory IDs to content hashes and storage pointers
- record producer identity and timestamp
- record policy and attestation references
- support append-only integrity checks

MVP implementation choices:

- signed local ledger
- append-only database table
- later, one onchain registry when needed

### 6.4 Optional Anchor Adapters

Expose the lightweight core to external chains or registries after the protocol is stable.

Examples:

- Polkadot memory registry
- Solana consumption mirror
- enterprise notarization service

These are explicitly optional for the first build.

## 7. Core Data Model

### 7.1 Memory Object

The primary unit in the protocol.

Fields:

- `memory_id`: protocol-level unique ID
- `content_cid`: pointer to stored object
- `content_hash`: canonical hash of serialized payload
- `producer_id`: agent, model, app, or organization identifier
- `owner_id`: current owner or controller
- `created_at`: protocol timestamp
- `anchor_refs`: optional external anchors
- `policy_id`: retention / access / visibility policy
- `attestation_refs`: signatures, proofs, endorsements
- `tags`: optional app-level categorization

### 7.2 Provenance Envelope

Metadata needed to verify how the memory was produced.

Fields:

- `model_name`
- `model_version`
- `provider`
- `prompt_hash`
- `context_hash`
- `tool_trace_hash`
- `input_refs`
- `output_schema_version`
- `agent_runtime_version`

### 7.3 Attestation Record

Evidence that a memory object is authentic or policy-compliant.

Examples:

- app signature
- agent key signature
- enterprise approval
- human review signoff
- execution proof

## 8. Canonical Write Flow

1. An AI app or agent produces an output.
2. A memory object builder normalizes the payload and metadata.
3. The full bundle is stored through a storage adapter.
4. The returned CID or storage key and canonical hash are written to the verification ledger.
5. Optional anchor adapters publish compact references to external systems.
6. Consumers fetch the bundle from storage and verify the recorded hash and metadata.

## 9. Canonical Read Flow

1. A client requests a memory object by ID.
2. The ledger returns the CID, metadata, and policy info.
3. The client fetches the raw bundle from storage.
4. The client recomputes the hash and matches it against the recorded entry.
5. The client checks attestations and permissions before use.

## 10. Trust Model

The protocol should minimize trust in the original AI application.

Trusted as little as possible:

- the app that created the response
- the storage gateway that served the payload
- the indexer that made the record searchable

Verified directly where possible:

- content hash matches the stored payload
- signatures match the claimed producer
- timestamps and anchors match ledger state
- policy references are consistent with ledger state

## 11. Privacy And Policy Constraints

This project will fail if it confuses immutability with indiscriminate permanence.

Rules for MVP:

- store full private prompts only when explicitly allowed
- prefer hashed references for sensitive context
- separate public memory from restricted memory
- make access policy explicit in metadata
- avoid placing raw private content directly onchain

A practical default is:

- ledger: hashes, CIDs, identity refs, policy refs
- offchain encrypted: full payloads and sensitive context

## 12. MVP Scope

The first version should do only the minimum needed to prove the protocol.

### 12.1 Must Have

- memory object schema
- canonical serialization and hashing
- storage upload through a pluggable adapter
- append-only verification ledger
- verification client that reconstructs and checks integrity

### 12.2 Nice To Have

- producer signatures
- encrypted payload mode
- searchable tags and filtering
- ownership transfer
- policy templates
- one optional chain anchor

### 12.3 Explicitly Deferred

- generalized cross-chain execution
- full agent wallet and treasury logic
- secondary market primitives
- advanced ZK provenance
- legal wrapper semantics

## 13. Suggested Modules

```text
apps/
  ingestion-api/
  verifier-cli/
  explorer-ui/

packages/
  memory-schema/
  hashing/
  ledger/
  storage-client/
  provenance/
  sdk/
  signer/

adapters/
  storage-local/
  storage-filecoin/
  anchor-polkadot/
  anchor-solana/

docs/
  architecture.md
```

## 14. Reference Interfaces

### 14.1 Create Memory Object

Input:

- response payload
- producer metadata
- optional policy metadata
- optional attestation material

Output:

- canonical hash
- CID
- ledger entry ID

### 14.2 Verify Memory Object

Input:

- memory ID or CID

Checks:

- payload hash
- producer signature
- ledger entry
- policy compatibility

Output:

- valid / invalid
- mismatch reason if invalid

## 15. Main Risks

- unclear boundary between user memory and AI memory
- privacy law conflict with immutable references
- weak producer identity model
- overbuilding chain integration before product usefulness is proven
- storing too much low-value data too early

## 16. Recommended Build Order

1. Define canonical schema and hash rules.
2. Implement storage writer and reader.
3. Build the append-only verification ledger.
4. Build local verifier.
5. Add signatures, policies, and access control.
6. Add one optional external anchor only when justified.

## 17. Positioning

Polana is best described as:

- an AI memory kernel
- a provenance and attestation layer
- a portable registry for AI-generated artifacts

It should not initially be described as:

- a generic bridge
- an AI legal personhood platform
- a universal immutable archive for all model activity

The first credible step is narrower: make AI outputs durable, attributable, and verifiable.
