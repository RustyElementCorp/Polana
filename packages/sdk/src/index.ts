import {
  type AttestationObject,
  type BindingObject,
  type MemoryObject,
  type ContentDescriptor,
  MEMORY_SCHEMA_VERSION,
  assertValidAttestationObject,
  assertValidBindingObject,
  assertValidMemoryObject,
  generateAttestationId,
  generateBindingId,
  generateOwnerId,
  generateProducerId,
} from "@polana/memory-schema";
import {
  createMemoryObjectWithDerivedIdentity,
  hashCanonicalMemoryObject,
  serializeCanonicalJson,
  toCanonicalHashInput,
} from "@polana/hashing";
import type {
  AttestationLedgerClient,
  AttestationLedgerEntry,
  AttestationLedgerRecord,
  BindingLedgerClient,
  BindingLedgerEntry,
  BindingLedgerRecord,
  LedgerClient,
  LedgerEntry,
  LedgerRecord,
} from "@polana/ledger";
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
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PolanaError";
  }
}

export interface NormalizedPolanaError {
  code: PolanaErrorCode;
  message: string;
  details?: unknown;
}

export function normalizePolanaError(error: unknown): NormalizedPolanaError {
  if (error instanceof PolanaError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: POLANA_ERROR_CODES.INVALID_INPUT,
      message: error.message,
    };
  }

  return {
    code: POLANA_ERROR_CODES.INVALID_INPUT,
    message: "unknown error",
  };
}

export interface ProducerSignerInput {
  algorithm: "ed25519";
  private_key_pem: string;
  public_key_pem: string;
  signer?: string;
}

export interface CreateMemoryInput extends Omit<MemoryObject, "schema_version" | "memory_id" | "content" | "integrity" | "producer" | "ownership"> {
  content_body: string;
  content_media_type?: string;
  content_encoding?: ContentDescriptor["encoding"];
  producer: Omit<MemoryObject["producer"], "producer_id"> & {
    producer_id?: string;
  };
  ownership: Omit<MemoryObject["ownership"], "owner_id"> & {
    owner_id?: string;
  };
  signer?: ProducerSignerInput;
}

export interface VerificationResult {
  ok: boolean;
  code?: PolanaErrorCode;
  reason?: string;
  record?: LedgerRecord;
}

export interface MemoryQuery {
  memory_id?: string;
  producer_id?: string;
  owner_id?: string;
  policy_id?: string;
  tag?: string;
}

export const POLANA_BUNDLE_VERSION = "1.0.0";

export interface ExportedMemoryBundle {
  bundle_version: typeof POLANA_BUNDLE_VERSION;
  record: LedgerRecord;
  content_body: string;
}

export interface CreateBindingInput extends Omit<BindingObject, "schema_version" | "binding_id"> {
  binding_id?: string;
}

export interface CreateAttestationInput extends Omit<AttestationObject, "schema_version" | "attestation_id"> {
  attestation_id?: string;
}

export interface StoredAttestationEntry {
  attestation_id: string;
  content_cid: string;
  subject_id: string;
  subject_type: AttestationObject["subject_type"];
  status: AttestationObject["status"];
  kind: AttestationObject["kind"];
}

export interface AttestationQuery {
  attestation_id?: string;
  subject_id?: string;
  subject_type?: AttestationObject["subject_type"];
  status?: AttestationObject["status"];
  kind?: AttestationObject["kind"];
  issuer_id?: string;
}

export interface StoredBindingEntry {
  binding_id: string;
  content_cid: string;
  recorded_at?: string;
  subject_id: string;
  subject_type: BindingObject["subject_type"];
  verification_status: BindingObject["verification"]["status"];
}

export interface BindingQuery {
  binding_id?: string;
  subject_id?: string;
  subject_type?: BindingObject["subject_type"];
  verification_status?: BindingObject["verification"]["status"];
  network?: string;
  scheme?: string;
}

export interface ExportedBindingBundle {
  bundle_version: typeof POLANA_BUNDLE_VERSION;
  record: BindingLedgerRecord;
  binding_body: string;
}

export interface ExportedAttestationBundle {
  bundle_version: typeof POLANA_BUNDLE_VERSION;
  record: AttestationLedgerRecord;
  attestation_body: string;
}

export function createBindingObject(input: CreateBindingInput): BindingObject {
  const binding: BindingObject = {
    schema_version: MEMORY_SCHEMA_VERSION,
    binding_id: input.binding_id ?? generateBindingId(),
    subject_id: input.subject_id,
    subject_type: input.subject_type,
    external_ref: input.external_ref,
    verification: input.verification,
    timestamps: input.timestamps,
    notes: input.notes,
  };

  assertValidBindingObject(binding);
  return binding;
}

export function createAttestationObject(input: CreateAttestationInput): AttestationObject {
  const attestation: AttestationObject = {
    schema_version: MEMORY_SCHEMA_VERSION,
    attestation_id: input.attestation_id ?? generateAttestationId(),
    subject_id: input.subject_id,
    subject_type: input.subject_type,
    kind: input.kind,
    issuer: input.issuer,
    evidence: input.evidence,
    status: input.status,
    timestamps: input.timestamps,
    notes: input.notes,
  };

  assertValidAttestationObject(attestation);
  return attestation;
}

export async function createAndStoreBindingObject(
  input: CreateBindingInput,
  storage: StorageClient,
): Promise<StoredBindingEntry> {
  const binding = createBindingObject(input);
  const raw = JSON.stringify(binding, null, 2);
  const stored = await storage.put(raw);
  return {
    binding_id: binding.binding_id,
    content_cid: stored.cid,
    subject_id: binding.subject_id,
    subject_type: binding.subject_type,
    verification_status: binding.verification.status,
  };
}

export async function createAndStoreAttestationObject(
  input: CreateAttestationInput,
  storage: StorageClient,
): Promise<StoredAttestationEntry> {
  const attestation = createAttestationObject(input);
  const raw = JSON.stringify(attestation, null, 2);
  const stored = await storage.put(raw);
  return {
    attestation_id: attestation.attestation_id,
    content_cid: stored.cid,
    subject_id: attestation.subject_id,
    subject_type: attestation.subject_type,
    status: attestation.status,
    kind: attestation.kind,
  };
}

export async function createAndRecordBindingObject(
  input: CreateBindingInput,
  storage: StorageClient,
  ledger: BindingLedgerClient,
): Promise<BindingLedgerEntry> {
  const binding = createBindingObject(input);
  const raw = JSON.stringify(binding, null, 2);
  const stored = await storage.put(raw);
  const recordedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const entry: BindingLedgerEntry = {
    binding_id: binding.binding_id,
    content_cid: stored.cid,
    recorded_at: recordedAt,
    subject_id: binding.subject_id,
    subject_type: binding.subject_type,
    verification_status: binding.verification.status,
  };

  await ledger.append({ entry, binding });
  return entry;
}

export async function createAndRecordAttestationObject(
  input: CreateAttestationInput,
  storage: StorageClient,
  ledger: AttestationLedgerClient,
): Promise<AttestationLedgerEntry> {
  const attestation = createAttestationObject(input);
  const raw = JSON.stringify(attestation, null, 2);
  const stored = await storage.put(raw);
  const recordedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const entry: AttestationLedgerEntry = {
    attestation_id: attestation.attestation_id,
    content_cid: stored.cid,
    recorded_at: recordedAt,
    subject_id: attestation.subject_id,
    subject_type: attestation.subject_type,
    status: attestation.status,
    kind: attestation.kind,
  };

  await ledger.append({ entry, attestation });
  return entry;
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
      producer_id: input.producer.producer_id ?? generateProducerId(),
      key_ref: input.producer.key_ref ?? input.signer?.public_key_pem,
    },
    ownership: {
      ...input.ownership,
      owner_id: input.ownership.owner_id ?? generateOwnerId(),
    },
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

export async function listRecordedMemoryObjects(
  ledger: LedgerClient,
  query: MemoryQuery = {},
): Promise<LedgerRecord[]> {
  const records = await ledger.list();
  return records.filter((record) => {
    if (query.memory_id && record.entry.memory_id !== query.memory_id) {
      return false;
    }
    if (query.producer_id && record.memory.producer.producer_id !== query.producer_id) {
      return false;
    }
    if (query.owner_id && record.memory.ownership.owner_id !== query.owner_id) {
      return false;
    }
    if (query.policy_id && record.memory.policy?.policy_id !== query.policy_id) {
      return false;
    }
    if (query.tag && !record.memory.tags?.includes(query.tag)) {
      return false;
    }
    return true;
  });
}

export async function exportRecordedMemoryObject(
  memoryId: string,
  storage: StorageClient,
  ledger: LedgerClient,
): Promise<ExportedMemoryBundle> {
  const record = await ledger.get(memoryId);
  if (!record) {
    throw new PolanaError(
      POLANA_ERROR_CODES.LEDGER_RECORD_NOT_FOUND,
      "ledger record not found",
    );
  }

  const bytes = await storage.get(record.entry.content_cid);
  return {
    bundle_version: POLANA_BUNDLE_VERSION,
    record,
    content_body: new TextDecoder().decode(bytes),
  };
}

export async function getRecordedBindingObject(
  bindingId: string,
  ledger: BindingLedgerClient,
): Promise<BindingLedgerRecord | null> {
  return ledger.get(bindingId);
}

export async function getRecordedAttestationObject(
  attestationId: string,
  ledger: AttestationLedgerClient,
): Promise<AttestationLedgerRecord | null> {
  return ledger.get(attestationId);
}

export async function listRecordedBindingObjects(
  ledger: BindingLedgerClient,
  query: BindingQuery = {},
): Promise<BindingLedgerRecord[]> {
  const records = await ledger.list();
  return records.filter((record) => {
    if (query.binding_id && record.entry.binding_id !== query.binding_id) {
      return false;
    }
    if (query.subject_id && record.binding.subject_id !== query.subject_id) {
      return false;
    }
    if (query.subject_type && record.binding.subject_type !== query.subject_type) {
      return false;
    }
    if (
      query.verification_status &&
      record.binding.verification.status !== query.verification_status
    ) {
      return false;
    }
    if (query.network && record.binding.external_ref.network !== query.network) {
      return false;
    }
    if (query.scheme && record.binding.external_ref.scheme !== query.scheme) {
      return false;
    }
    return true;
  });
}

export async function listRecordedAttestationObjects(
  ledger: AttestationLedgerClient,
  query: AttestationQuery = {},
): Promise<AttestationLedgerRecord[]> {
  const records = await ledger.list();
  return records.filter((record) => {
    if (query.attestation_id && record.entry.attestation_id !== query.attestation_id) {
      return false;
    }
    if (query.subject_id && record.attestation.subject_id !== query.subject_id) {
      return false;
    }
    if (query.subject_type && record.attestation.subject_type !== query.subject_type) {
      return false;
    }
    if (query.status && record.attestation.status !== query.status) {
      return false;
    }
    if (query.kind && record.attestation.kind !== query.kind) {
      return false;
    }
    if (query.issuer_id && record.attestation.issuer.issuer_id !== query.issuer_id) {
      return false;
    }
    return true;
  });
}

export async function exportRecordedBindingObject(
  bindingId: string,
  storage: StorageClient,
  ledger: BindingLedgerClient,
): Promise<ExportedBindingBundle> {
  const record = await ledger.get(bindingId);
  if (!record) {
    throw new PolanaError(
      POLANA_ERROR_CODES.LEDGER_RECORD_NOT_FOUND,
      "binding ledger record not found",
    );
  }

  const bytes = await storage.get(record.entry.content_cid);
  return {
    bundle_version: POLANA_BUNDLE_VERSION,
    record,
    binding_body: new TextDecoder().decode(bytes),
  };
}

export async function exportRecordedAttestationObject(
  attestationId: string,
  storage: StorageClient,
  ledger: AttestationLedgerClient,
): Promise<ExportedAttestationBundle> {
  const record = await ledger.get(attestationId);
  if (!record) {
    throw new PolanaError(
      POLANA_ERROR_CODES.LEDGER_RECORD_NOT_FOUND,
      "attestation ledger record not found",
    );
  }

  const bytes = await storage.get(record.entry.content_cid);
  return {
    bundle_version: POLANA_BUNDLE_VERSION,
    record,
    attestation_body: new TextDecoder().decode(bytes),
  };
}

export async function importRecordedBindingBundle(
  bundle: ExportedBindingBundle,
  storage: StorageClient,
  ledger: BindingLedgerClient,
): Promise<BindingLedgerEntry> {
  if (bundle.bundle_version !== POLANA_BUNDLE_VERSION) {
    throw new PolanaError(
      POLANA_ERROR_CODES.INVALID_INPUT,
      "unsupported binding bundle version",
      { expected: POLANA_BUNDLE_VERSION, actual: bundle.bundle_version },
    );
  }

  assertValidBindingObject(bundle.record.binding);

  const stored = await storage.put(bundle.binding_body);
  if (stored.cid !== bundle.record.entry.content_cid) {
    throw new PolanaError(
      POLANA_ERROR_CODES.CONTENT_CID_MISMATCH,
      "imported binding content cid does not match binding ledger cid",
    );
  }

  const existing = await ledger.get(bundle.record.entry.binding_id);
  if (existing) {
    return existing.entry;
  }

  await ledger.append(bundle.record);
  return bundle.record.entry;
}

export async function importRecordedAttestationBundle(
  bundle: ExportedAttestationBundle,
  storage: StorageClient,
  ledger: AttestationLedgerClient,
): Promise<AttestationLedgerEntry> {
  if (bundle.bundle_version !== POLANA_BUNDLE_VERSION) {
    throw new PolanaError(
      POLANA_ERROR_CODES.INVALID_INPUT,
      "unsupported attestation bundle version",
      { expected: POLANA_BUNDLE_VERSION, actual: bundle.bundle_version },
    );
  }

  assertValidAttestationObject(bundle.record.attestation);

  const stored = await storage.put(bundle.attestation_body);
  if (stored.cid !== bundle.record.entry.content_cid) {
    throw new PolanaError(
      POLANA_ERROR_CODES.CONTENT_CID_MISMATCH,
      "imported attestation content cid does not match attestation ledger cid",
    );
  }

  const existing = await ledger.get(bundle.record.entry.attestation_id);
  if (existing) {
    return existing.entry;
  }

  await ledger.append(bundle.record);
  return bundle.record.entry;
}

export async function importRecordedMemoryBundle(
  bundle: ExportedMemoryBundle,
  storage: StorageClient,
  ledger: LedgerClient,
): Promise<LedgerEntry> {
  if (bundle.bundle_version !== POLANA_BUNDLE_VERSION) {
    throw new PolanaError(
      POLANA_ERROR_CODES.INVALID_INPUT,
      "unsupported memory bundle version",
      { expected: POLANA_BUNDLE_VERSION, actual: bundle.bundle_version },
    );
  }

  assertValidMemoryObject(bundle.record.memory);

  if (bundle.record.entry.canonical_hash !== bundle.record.memory.integrity.canonical_hash) {
    throw new PolanaError(
      POLANA_ERROR_CODES.LEDGER_HASH_MISMATCH,
      "ledger hash does not match memory integrity hash",
    );
  }

  const recomputedHash = hashCanonicalMemoryObject(bundle.record.memory);
  if (recomputedHash !== bundle.record.memory.integrity.canonical_hash) {
    throw new PolanaError(
      POLANA_ERROR_CODES.CANONICAL_HASH_MISMATCH,
      "recomputed canonical hash mismatch",
    );
  }

  const stored = await storage.put(bundle.content_body);
  if (stored.cid !== bundle.record.memory.content.cid) {
    throw new PolanaError(
      POLANA_ERROR_CODES.CONTENT_CID_MISMATCH,
      "imported content cid does not match memory content cid",
    );
  }

  const existing = await ledger.get(bundle.record.entry.memory_id);
  if (existing) {
    return existing.entry;
  }

  await ledger.append(bundle.record);
  return bundle.record.entry;
}
