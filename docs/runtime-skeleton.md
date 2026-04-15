# Runtime Skeleton

This repo now includes a minimal runtime crate:

- [rust/polana-runtime](/Users/degikwag/code/llm/Polana/rust/polana-runtime)

## Goal

This is not a full node yet.

It does one narrower job:

- define a reusable Substrate runtime crate
- integrate `pallet-memory-registry`
- fix the first runtime-level types and constants
- give the project a stable target for future node packaging

## Included Modules

- `System`
- `MemoryRegistry`

## Current Runtime Shape

- `AccountId = u64`
- `Nonce = u64`
- `BlockNumber = u64`
- `Hash = H256`
- `MaxFieldLength = 256`

## Why This Matters

Before this, the pallet only lived inside a mock test runtime.

Now the project has:

1. a chain-agnostic core
2. a pallet
3. a relayer
4. a dedicated runtime crate where the pallet is actually composed

That is the correct boundary before creating:

- a node binary
- a chain spec
- local dev launch scripts

## Next Steps

1. add a real node crate or node-template integration
2. expose metadata from this runtime for `subxt` codegen if needed
3. package local dev startup for the Substrate side
