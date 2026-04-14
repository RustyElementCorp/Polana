export type HashAlgorithm = "sha256" | "sha3-256" | "blake3";
export type ProducerType =
  | "agent"
  | "model"
  | "application"
  | "organization"
  | "human";
export type OwnerType = "user" | "organization" | "application" | "shared";
export type Visibility = "public" | "restricted" | "private";
export type Retention = "permanent" | "archival" | "time_bound";
export type SourceClock = "app" | "ledger" | "anchor";

export interface EncryptionDescriptor {
  enabled: boolean;
  scheme?: string;
  key_ref?: string;
}

export interface PayloadSummary {
  kind?: "response" | "tool_trace" | "artifact_bundle" | "conversation_turn" | "other";
  preview?: string;
}

export interface ContentDescriptor {
  cid: string;
  media_type: string;
  encoding: "json" | "jsonl" | "cbor" | "text" | "binary";
  size_bytes: number;
  encryption?: EncryptionDescriptor;
  payload_summary?: PayloadSummary;
}

export interface ProvenanceEnvelope {
  model_name: string;
  model_version?: string;
  provider: string;
  prompt_hash?: string;
  context_hash?: string;
  tool_trace_hash?: string;
  input_refs?: string[];
  output_schema_version: string;
  agent_runtime_version?: string;
  temperature?: number;
  top_p?: number;
}

export interface ProducerDescriptor {
  producer_id: string;
  producer_type: ProducerType;
  display_name?: string;
  key_ref?: string;
}

export interface OwnershipDescriptor {
  owner_id: string;
  owner_type: OwnerType;
  transferable?: boolean;
}

export interface SignatureDescriptor {
  algorithm: "ed25519" | "secp256k1" | "rsa-pss";
  signer: string;
  value: string;
}

export interface IntegrityDescriptor {
  canonical_hash: string;
  hash_algorithm: HashAlgorithm;
  signature?: SignatureDescriptor;
  merkle_root?: string;
}

export interface TimestampDescriptor {
  created_at: string;
  recorded_at?: string;
  source_clock?: SourceClock;
}

export interface PolicyDescriptor {
  policy_id: string;
  visibility: Visibility;
  retention?: Retention;
  legal_basis_ref?: string;
}

export interface AttestationRecord {
  kind:
    | "producer_signature"
    | "human_review"
    | "enterprise_approval"
    | "execution_proof"
    | "compliance_check";
  issuer: string;
  issued_at: string;
  value?: string;
  ref?: string;
}

export interface AnchorReference {
  system: string;
  ref: string;
  status?: "pending" | "confirmed" | "failed";
}

export interface RelationReference {
  type: "derived_from" | "replies_to" | "references" | "supersedes" | "belongs_to_session";
  target: string;
}

export interface MemoryObject {
  schema_version: "1.0.0";
  memory_id: string;
  content: ContentDescriptor;
  provenance: ProvenanceEnvelope;
  producer: ProducerDescriptor;
  ownership: OwnershipDescriptor;
  integrity: IntegrityDescriptor;
  timestamps: TimestampDescriptor;
  policy?: PolicyDescriptor;
  attestations?: AttestationRecord[];
  anchors?: AnchorReference[];
  tags?: string[];
  relations?: RelationReference[];
}

export const MEMORY_SCHEMA_VERSION = "1.0.0";

const HASH_PATTERN = /^[a-f0-9]{64,128}$/;
const MEMORY_ID_PATTERN = /^mem_[a-z0-9_-]{16,}$/;
const RFC3339_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function assertHash(name: string, value: unknown, required = false): void {
  if (value === undefined) {
    assert(!required, `${name} is required`);
    return;
  }
  assert(typeof value === "string" && HASH_PATTERN.test(value), `${name} must be a lowercase hex hash`);
}

function assertTimestamp(name: string, value: unknown, required = false): void {
  if (value === undefined) {
    assert(!required, `${name} is required`);
    return;
  }
  assert(typeof value === "string" && RFC3339_UTC_PATTERN.test(value), `${name} must be an RFC3339 UTC timestamp`);
}

export function assertValidMemoryObject(value: unknown): asserts value is MemoryObject {
  assert(isRecord(value), "memory object must be an object");
  assert(value.schema_version === MEMORY_SCHEMA_VERSION, "schema_version must be 1.0.0");
  assert(typeof value.memory_id === "string" && MEMORY_ID_PATTERN.test(value.memory_id), "memory_id format is invalid");

  assert(isRecord(value.content), "content is required");
  assert(typeof value.content.cid === "string" && value.content.cid.length >= 16, "content.cid is invalid");
  assert(typeof value.content.media_type === "string" && value.content.media_type.length > 0, "content.media_type is required");
  assert(["json", "jsonl", "cbor", "text", "binary"].includes(String(value.content.encoding)), "content.encoding is invalid");
  assert(typeof value.content.size_bytes === "number" && Number.isInteger(value.content.size_bytes) && value.content.size_bytes > 0, "content.size_bytes must be a positive integer");

  assert(isRecord(value.provenance), "provenance is required");
  assert(typeof value.provenance.model_name === "string" && value.provenance.model_name.length > 0, "provenance.model_name is required");
  assert(typeof value.provenance.provider === "string" && value.provenance.provider.length > 0, "provenance.provider is required");
  assert(typeof value.provenance.output_schema_version === "string" && value.provenance.output_schema_version.length > 0, "provenance.output_schema_version is required");
  assertHash("provenance.prompt_hash", value.provenance.prompt_hash);
  assertHash("provenance.context_hash", value.provenance.context_hash);
  assertHash("provenance.tool_trace_hash", value.provenance.tool_trace_hash);
  if (value.provenance.input_refs !== undefined) {
    assert(isStringArray(value.provenance.input_refs), "provenance.input_refs must be a string array");
  }

  assert(isRecord(value.producer), "producer is required");
  assert(typeof value.producer.producer_id === "string" && value.producer.producer_id.length > 0, "producer.producer_id is required");
  assert(["agent", "model", "application", "organization", "human"].includes(String(value.producer.producer_type)), "producer.producer_type is invalid");

  assert(isRecord(value.ownership), "ownership is required");
  assert(typeof value.ownership.owner_id === "string" && value.ownership.owner_id.length > 0, "ownership.owner_id is required");
  assert(["user", "organization", "application", "shared"].includes(String(value.ownership.owner_type)), "ownership.owner_type is invalid");

  assert(isRecord(value.integrity), "integrity is required");
  assertHash("integrity.canonical_hash", value.integrity.canonical_hash, true);
  assert(["sha256", "sha3-256", "blake3"].includes(String(value.integrity.hash_algorithm)), "integrity.hash_algorithm is invalid");
  if (value.integrity.signature !== undefined) {
    assert(isRecord(value.integrity.signature), "integrity.signature must be an object");
    assert(["ed25519", "secp256k1", "rsa-pss"].includes(String(value.integrity.signature.algorithm)), "integrity.signature.algorithm is invalid");
    assert(typeof value.integrity.signature.signer === "string" && value.integrity.signature.signer.length > 0, "integrity.signature.signer is required");
    assert(typeof value.integrity.signature.value === "string" && BASE64_PATTERN.test(value.integrity.signature.value), "integrity.signature.value must be base64");
  }

  assert(isRecord(value.timestamps), "timestamps is required");
  assertTimestamp("timestamps.created_at", value.timestamps.created_at, true);
  assertTimestamp("timestamps.recorded_at", value.timestamps.recorded_at);
  if (value.timestamps.source_clock !== undefined) {
    assert(["app", "ledger", "anchor"].includes(String(value.timestamps.source_clock)), "timestamps.source_clock is invalid");
  }

  if (value.policy !== undefined) {
    assert(isRecord(value.policy), "policy must be an object");
    assert(typeof value.policy.policy_id === "string" && value.policy.policy_id.length > 0, "policy.policy_id is required");
    assert(["public", "restricted", "private"].includes(String(value.policy.visibility)), "policy.visibility is invalid");
  }

  if (value.attestations !== undefined) {
    assert(Array.isArray(value.attestations), "attestations must be an array");
  }

  if (value.anchors !== undefined) {
    assert(Array.isArray(value.anchors), "anchors must be an array");
  }

  if (value.tags !== undefined) {
    assert(isStringArray(value.tags), "tags must be a string array");
  }

  if (value.relations !== undefined) {
    assert(Array.isArray(value.relations), "relations must be an array");
  }
}
