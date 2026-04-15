# Dual-Chain Strategy

This document defines the current strategic direction for Polana.

## 1. Decision

Polana will proceed as a `dual-chain memory protocol`, while keeping the memory core chain-agnostic.

That means:

- the `vanilla core` remains logically separable
- one onchain path can optimize for onboarding and registry behavior
- another onchain path can optimize for access, execution, or distribution

The important constraint is that chains adapt to the core, not the other way around.

## 2. Why Dual Chain

One chain is rarely ideal for every requirement in this project.

Polana needs to balance:

- durable identity and registry semantics
- ecosystem onboarding speed
- application-facing composability
- long-term portability

A dual-chain approach allows the project to avoid forcing all tradeoffs into one runtime too early.

## 3. Layer Split

### 3.1 Vanilla Core

This is the protocol kernel and should remain chain-independent.

Responsibilities:

- memory object schema
- canonicalization
- hashing
- memory ID derivation
- signature creation and verification
- anchor payload extraction

Current code:

- [rust/polana-core](/Users/degikwag/code/llm/Polana/rust/polana-core)
- [packages/memory-schema](/Users/degikwag/code/llm/Polana/packages/memory-schema)
- [packages/hashing](/Users/degikwag/code/llm/Polana/packages/hashing)
- [packages/signer](/Users/degikwag/code/llm/Polana/packages/signer)

### 3.2 Chain A: Registry / Onboarding Chain

This chain is optimized for getting the protocol onchain quickly and providing a credible anchor layer.

Current candidate:

- Substrate-compatible chain

Current code:

- [rust/pallet-memory-registry](/Users/degikwag/code/llm/Polana/rust/pallet-memory-registry)

Responsibilities:

- register memory anchors
- maintain onchain uniqueness
- emit events for indexers and relayers
- provide a governance-friendly registry path

### 3.3 Chain B: Access / Consumption Chain

This chain is optimized for downstream use, distribution, or application-facing behavior.

Candidate responsibilities:

- fast reads and app consumption
- memory-linked settlement or fees
- access routing
- secondary integration surface for AI-native apps

Leading candidate:

- Solana

Current code direction:

- [rust/solana-memory-mirror](/Users/degikwag/code/llm/Polana/rust/solana-memory-mirror)

## 4. Current Interpretation Of The Substrate Work

The Substrate pallet is:

- an intentional first onchain adapter
- a registry-oriented chain implementation
- not the entire architectural commitment of Polana

It should be read as `Chain A`, not as the whole system.

## 5. Architectural Rule

Every chain-specific module must be derivable from the same core artifact:

- memory object
- canonical hash
- signature state
- anchor payload

If a chain integration requires changing those core semantics, it is the wrong abstraction boundary.

## 6. Near-Term Build Order

1. keep strengthening `vanilla core`
2. keep Substrate anchor path as the first real chain adapter
3. keep Solana as the leading second-chain target unless product constraints change
4. add bridge or mirror logic only after both chain roles are clear

## 7. What This Avoids

This strategy avoids:

- overcommitting to one chain too early
- bloating the memory core with chain-specific assumptions
- treating the Substrate implementation as the only valid future

## 8. Practical Summary

The project should now be described as:

- a chain-agnostic AI memory core
- with a first Substrate-compatible anchor layer
- and a planned second chain integration for dual-chain operation
