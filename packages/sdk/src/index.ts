import {
  type MemoryObject,
  type ContentDescriptor,
  MEMORY_SCHEMA_VERSION,
  assertValidMemoryObject,
} from "@polana/memory-schema";
import {
  createMemoryObjectWithDerivedIdentity,
  hashCanonicalMemoryObject,
  serializeCanonicalJson,
  toCanonicalHashInput,
} from "@polana/hashing";
import type { LedgerClient, LedgerEntry, LedgerRecord } from "@polana/ledger";
import {
  signPayloadEd25519,
  verifyPayloadEd25519,
} from "@polana/signer";
import type { StorageClient } from "@polana/storage-client";

export const POLANA_ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  LEDGER_RECORD_NOT_FOUND: "LEDGER_RECORD_NOT_FOUND",
  LEDGER_HASH_MISMATCH: "LEDGER_HASH_MISMATCH",
  STORED_CONTENT_MISSING: "STORED_CONTENT_MISSING",
  CONTENT_CID_MISMATCH: "CONTENT_CID_MISMATCH",
  CANONICAL_HASH_MISMATCH: "CANONICAL_HASH_MISMATCH",
  PRODUCER_KEY_MISSING: "PRODUCER_KEY_MISSING",
  SIGNATURE_VERIFICATION_FAILED: "SIGNATURE_VERIFICATION_FAILED",
} as const;

export type PolanaErrorCode =
  (typeof POLANA_ERROR_CODES)[keyof typeof POLANA_ERROR_CODES];

export class PolanaError extends Error {
  constructor(
    public readonly code: PolanaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PolanaError";
  }
}

export interface ProducerSignerInput {
  algorithm: "ed25519";
  private_key_pem: string;
  public_key_pem: string;
  signer?: string;
}

export interface CreateMemoryInput extends Omit<MemoryObject, "schema_version" | "memory_id" | "content" | "integrity"> {
  content_body: string;
  content_media_type?: string;
  content_encoding?: ContentDescriptor["encoding"];
  signer?: ProducerSignerInput;
}

export interface VerificationResult {
  ok: boolean;
  code?: PolanaErrorCode;
  reason?: string;
  record?: LedgerRecord;
}

export async function createAndRecordMemoryObject(
  input: CreateMemoryInput,
  storage: StorageClient,
  ledger: LedgerClient,
): Promise<LedgerEntry> {
  const serializedContent = input.content_body;
  const stored = await storage.put(serializedContent);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const memory = createMemoryObjectWithDerivedIdentity({
    schema_version: MEMORY_SCHEMA_VERSION,
    content: {
      cid: stored.cid,
      media_type: input.content_media_type ?? "application/json",
      encoding: input.content_encoding ?? "json",
      size_bytes: stored.bytes,
    },
    provenance: input.provenance,
    producer: {
      ...input.producer,
      key_ref: input.producer.key_ref ?? input.signer?.public_key_pem,
    },
    ownership: input.ownership,
    timestamps: {
      ...input.timestamps,
      recorded_at: input.timestamps.recorded_at ?? now,
      source_clock: input.timestamps.source_clock ?? "ledger",
    },
    policy: input.policy,
    attestations: input.attestations,
    tags: input.tags,
    relations: input.relations,
    anchors: input.anchors,
  });

  const signedMemory = input.signer
    ? {
        ...memory,
        integrity: {
          ...memory.integrity,
          signature: signPayloadEd25519(
            serializeCanonicalJson(toCanonicalHashInput(memory)),
            input.signer.private_key_pem,
            input.signer.signer ?? input.signer.public_key_pem,
          ),
        },
      }
    : memory;

  const entry: LedgerEntry = {
    memory_id: signedMemory.memory_id,
    canonical_hash: signedMemory.integrity.canonical_hash,
    content_cid: signedMemory.content.cid,
    recorded_at: signedMemory.timestamps.recorded_at ?? now,
    producer_id: signedMemory.producer.producer_id,
    policy_id: signedMemory.policy?.policy_id,
  };

  await ledger.append({ entry, memory: signedMemory });
  return entry;
}

export async function verifyRecordedMemoryObject(
  memoryId: string,
  storage: StorageClient,
  ledger: LedgerClient,
): Promise<VerificationResult> {
  const record = await ledger.get(memoryId);
  if (!record) {
    return {
      ok: false,
      code: POLANA_ERROR_CODES.LEDGER_RECORD_NOT_FOUND,
      reason: "ledger record not found",
    };
  }

  assertValidMemoryObject(record.memory);

  if (record.entry.canonical_hash !== record.memory.integrity.canonical_hash) {
    return {
      ok: false,
      code: POLANA_ERROR_CODES.LEDGER_HASH_MISMATCH,
      reason: "ledger hash does not match memory integrity hash",
      record,
    };
  }

  if (!(await storage.has(record.entry.content_cid))) {
    return {
      ok: false,
      code: POLANA_ERROR_CODES.STORED_CONTENT_MISSING,
      reason: "stored content missing",
      record,
    };
  }

  if (record.memory.content.cid !== record.entry.content_cid) {
    return {
      ok: false,
      code: POLANA_ERROR_CODES.CONTENT_CID_MISMATCH,
      reason: "ledger cid does not match memory content cid",
      record,
    };
  }

  const recomputedHash = hashCanonicalMemoryObject(record.memory);
  if (recomputedHash !== record.memory.integrity.canonical_hash) {
    return {
      ok: false,
      code: POLANA_ERROR_CODES.CANONICAL_HASH_MISMATCH,
      reason: "recomputed canonical hash mismatch",
      record,
    };
  }

  const signature = record.memory.integrity.signature;
  if (signature) {
    if (!record.memory.producer.key_ref) {
      return {
        ok: false,
        code: POLANA_ERROR_CODES.PRODUCER_KEY_MISSING,
        reason: "producer key_ref missing for signed memory",
        record,
      };
    }

    const signingPayload = serializeCanonicalJson(toCanonicalHashInput(record.memory));
    const signatureOk = verifyPayloadEd25519(
      signingPayload,
      signature,
      record.memory.producer.key_ref,
    );

    if (!signatureOk) {
      return {
        ok: false,
        code: POLANA_ERROR_CODES.SIGNATURE_VERIFICATION_FAILED,
        reason: "producer signature verification failed",
        record,
      };
    }
  }

  return { ok: true, record };
}

export async function getRecordedMemoryObject(
  memoryId: string,
  ledger: LedgerClient,
): Promise<LedgerRecord | null> {
  return ledger.get(memoryId);
}
