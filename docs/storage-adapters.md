# Storage Adapter Interface

This document defines the storage contract for the Polana TypeScript reference core.

## Purpose

The protocol should not depend on one storage backend. The storage adapter isolates persistence from canonicalization, signing, and ledger verification.

Current reference implementation:

- [packages/storage-client/src/index.ts](/Users/degikwag/code/llm/Polana/packages/storage-client/src/index.ts)

## Interface

The current interface is intentionally small:

```ts
export interface StoredObject {
  cid: string;
  bytes: number;
  path: string;
}

export interface StorageClient {
  put(data: string | Uint8Array): Promise<StoredObject>;
  get(cid: string): Promise<Uint8Array>;
  has(cid: string): Promise<boolean>;
}
```

## Required Semantics

Every adapter must preserve these rules:

- `put` must be deterministic with respect to the input bytes
- `cid` must identify the stored payload, not the ledger record
- `get` must return the exact bytes that were stored
- `has` must report existence for the same logical object that `get` would read
- adapters must not mutate content on write or read

## CID Guidance

The reference local adapter uses:

- `local_<sha256(bytes)>`

This is not meant to be the long-term universal CID format. It is a local reference identifier for testing and development.

Future adapters may use:

- IPFS CID
- Filecoin / Storacha content identifiers
- enterprise object storage pointers wrapped in a protocol-specific descriptor

The important part is byte identity, not one specific string format.

## Current Reference Adapter

The local adapter:

- computes `sha256` over the stored bytes
- prefixes the digest with `local_`
- writes to a sharded directory under `.polana/storage`

This gives the TS reference core:

- deterministic local storage
- reproducible testing
- no network dependency

## Planned Adapter Extensions

The current contract is enough for the reference core, but production adapters will likely need:

- metadata reads
- delete or tombstone policy hooks
- encryption envelope support
- streaming upload and download
- remote availability checks
- retry and timeout policies

These should be added as versioned interface changes, not ad hoc per adapter.

## Adapter Roadmap

Expected order:

1. `storage-local`
2. `storage-ipfs-compatible`
3. `storage-filecoin` / `storage-storacha`

The TS reference core should continue to target the interface, not a single provider implementation.
