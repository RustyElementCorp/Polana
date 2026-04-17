import { randomBytes } from "node:crypto";

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
export type BindingSubjectType = "producer" | "owner" | "attestation" | "anchor";
export type BindingVerificationStatus = "claimed" | "verified" | "revoked";
export type AttestationSubjectType =
  | "memory"
  | "binding"
  | "producer"
  | "owner"
  | "attestation"
  | "anchor";
export type AttestationIssuerType = "producer" | "owner";
export type AttestationStatus = "issued" | "revoked";
export type AttestationKind =
  | "producer_signature"
  | "human_review"
  | "enterprise_approval"
  | "execution_proof"
  | "compliance_check"
  | "binding_verification"
  | "anchor_confirmation";

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

export interface ExternalAddressReference {
  network: string;
  address: string;
  scheme: string;
}

export interface BindingVerificationDescriptor {
  status: BindingVerificationStatus;
  method: string;
  evidence_ref?: string;
  verified_by?: string;
}

export interface BindingTimestamps {
  created_at: string;
  verified_at?: string;
  revoked_at?: string;
}

export interface BindingObject {
  schema_version: "1.0.0";
  binding_id: string;
  subject_id: string;
  subject_type: BindingSubjectType;
  external_ref: ExternalAddressReference;
  verification: BindingVerificationDescriptor;
  timestamps: BindingTimestamps;
  notes?: string;
}

export interface AttestationIssuerDescriptor {
  issuer_id: string;
  issuer_type: AttestationIssuerType;
  display_name?: string;
  key_ref?: string;
}

export interface AttestationEvidenceDescriptor {
  method: string;
  value?: string;
  ref?: string;
  hash?: string;
}

export interface AttestationTimestamps {
  issued_at: string;
  revoked_at?: string;
}

export interface AttestationObject {
  schema_version: "1.0.0";
  attestation_id: string;
  subject_id: string;
  subject_type: AttestationSubjectType;
  kind: AttestationKind;
  issuer: AttestationIssuerDescriptor;
  evidence: AttestationEvidenceDescriptor;
  status: AttestationStatus;
  timestamps: AttestationTimestamps;
  notes?: string;
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
export const CORE_ID_BODY_PATTERN = /^[a-z0-9]{20,64}$/;
export const PRODUCER_ID_PATTERN = /^prod_[a-z0-9]{20,64}$/;
export const OWNER_ID_PATTERN = /^own_[a-z0-9]{20,64}$/;
export const BINDING_ID_PATTERN = /^bind_[a-z0-9]{20,64}$/;
export const ATTESTATION_ID_PATTERN = /^att_[a-z0-9]{20,64}$/;
export const ANCHOR_ID_PATTERN = /^anch_[a-z0-9]{20,64}$/;

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

function toBase32LowerNoPadding(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

export function isProducerId(value: string): boolean {
  return PRODUCER_ID_PATTERN.test(value);
}

export function isMemoryId(value: string): boolean {
  return MEMORY_ID_PATTERN.test(value);
}

export function isOwnerId(value: string): boolean {
  return OWNER_ID_PATTERN.test(value);
}

export function isBindingId(value: string): boolean {
  return BINDING_ID_PATTERN.test(value);
}

export function isAttestationId(value: string): boolean {
  return ATTESTATION_ID_PATTERN.test(value);
}

export function isAnchorId(value: string): boolean {
  return ANCHOR_ID_PATTERN.test(value);
}

export function validateProducerId(value: string): void {
  assert(isProducerId(value), "producer_id must match ^prod_[a-z0-9]{20,64}$");
}

export function validateMemoryId(value: string): void {
  assert(isMemoryId(value), "memory_id must match ^mem_[a-z0-9_-]{16,}$");
}

export function validateOwnerId(value: string): void {
  assert(isOwnerId(value), "owner_id must match ^own_[a-z0-9]{20,64}$");
}

export function validateBindingId(value: string): void {
  assert(isBindingId(value), "binding_id must match ^bind_[a-z0-9]{20,64}$");
}

export function validateAttestationId(value: string): void {
  assert(isAttestationId(value), "attestation_id must match ^att_[a-z0-9]{20,64}$");
}

export function validateAnchorId(value: string): void {
  assert(isAnchorId(value), "anchor_id must match ^anch_[a-z0-9]{20,64}$");
}

function validateBindingSubjectId(subjectType: BindingSubjectType, value: string): void {
  if (subjectType === "producer") {
    validateProducerId(value);
    return;
  }
  if (subjectType === "owner") {
    validateOwnerId(value);
    return;
  }
  if (subjectType === "attestation") {
    validateAttestationId(value);
    return;
  }
  if (subjectType === "anchor") {
    validateAnchorId(value);
    return;
  }

  assert(false, "binding.subject_type is invalid");
}

export function createCoreIdFromBytes(
  prefix: "prod" | "own" | "bind" | "att" | "anch",
  bytes: Uint8Array,
): string {
  assert(bytes.byteLength >= 16, "core id generation requires at least 16 bytes");
  const body = toBase32LowerNoPadding(bytes);
  assert(CORE_ID_BODY_PATTERN.test(body), "generated core id body is invalid");
  return `${prefix}_${body}`;
}

export function generateProducerId(): string {
  return createCoreIdFromBytes("prod", randomBytes(16));
}

export function generateOwnerId(): string {
  return createCoreIdFromBytes("own", randomBytes(16));
}

export function generateBindingId(): string {
  return createCoreIdFromBytes("bind", randomBytes(16));
}

export function generateAttestationId(): string {
  return createCoreIdFromBytes("att", randomBytes(16));
}

export function generateAnchorId(): string {
  return createCoreIdFromBytes("anch", randomBytes(16));
}

export function assertValidBindingObject(value: unknown): asserts value is BindingObject {
  assert(isRecord(value), "binding object must be an object");
  assert(value.schema_version === MEMORY_SCHEMA_VERSION, "binding.schema_version must be 1.0.0");
  assert(typeof value.binding_id === "string", "binding.binding_id is required");
  validateBindingId(value.binding_id);
  assert(typeof value.subject_id === "string", "binding.subject_id is required");
  assert(
    ["producer", "owner", "attestation", "anchor"].includes(String(value.subject_type)),
    "binding.subject_type is invalid",
  );
  validateBindingSubjectId(value.subject_type as BindingSubjectType, value.subject_id);

  assert(isRecord(value.external_ref), "binding.external_ref is required");
  assert(
    typeof value.external_ref.network === "string" && value.external_ref.network.trim().length > 0,
    "binding.external_ref.network is required",
  );
  assert(
    typeof value.external_ref.address === "string" && value.external_ref.address.trim().length > 0,
    "binding.external_ref.address is required",
  );
  assert(
    typeof value.external_ref.scheme === "string" && value.external_ref.scheme.trim().length > 0,
    "binding.external_ref.scheme is required",
  );

  assert(isRecord(value.verification), "binding.verification is required");
  assert(
    ["claimed", "verified", "revoked"].includes(String(value.verification.status)),
    "binding.verification.status is invalid",
  );
  assert(
    typeof value.verification.method === "string" && value.verification.method.trim().length > 0,
    "binding.verification.method is required",
  );

  assert(isRecord(value.timestamps), "binding.timestamps is required");
  assertTimestamp("binding.timestamps.created_at", value.timestamps.created_at, true);
  assertTimestamp("binding.timestamps.verified_at", value.timestamps.verified_at);
  assertTimestamp("binding.timestamps.revoked_at", value.timestamps.revoked_at);
  assertValidBindingLifecycle(value as unknown as BindingObject);
}

export function assertValidBindingLifecycle(binding: BindingObject): void {
  const status = binding.verification.status;
  const verifiedAt = binding.timestamps.verified_at;
  const revokedAt = binding.timestamps.revoked_at;

  if (status === "claimed") {
    assert(verifiedAt === undefined, "claimed binding must not include timestamps.verified_at");
    assert(revokedAt === undefined, "claimed binding must not include timestamps.revoked_at");
    return;
  }

  if (status === "verified") {
    assert(verifiedAt !== undefined, "verified binding must include timestamps.verified_at");
    assert(revokedAt === undefined, "verified binding must not include timestamps.revoked_at");
    return;
  }

  if (status === "revoked") {
    assert(revokedAt !== undefined, "revoked binding must include timestamps.revoked_at");
  }
}

export function assertValidBindingTransition(
  previousStatus: BindingVerificationStatus,
  nextBinding: BindingObject,
): void {
  assertValidBindingObject(nextBinding);
  const nextStatus = nextBinding.verification.status;

  const allowed =
    previousStatus === nextStatus
    || (previousStatus === "claimed" && (nextStatus === "verified" || nextStatus === "revoked"))
    || (previousStatus === "verified" && nextStatus === "revoked");

  assert(
    allowed,
    `binding transition ${previousStatus} -> ${nextStatus} is invalid`,
  );
}

function validateAttestationSubjectId(
  subjectType: AttestationSubjectType,
  subjectId: string,
): void {
  if (subjectType === "memory") {
    validateMemoryId(subjectId);
    return;
  }

  if (subjectType === "binding") {
    validateBindingId(subjectId);
    return;
  }

  if (subjectType === "producer") {
    validateProducerId(subjectId);
    return;
  }

  if (subjectType === "owner") {
    validateOwnerId(subjectId);
    return;
  }

  if (subjectType === "attestation") {
    validateAttestationId(subjectId);
    return;
  }

  if (subjectType === "anchor") {
    validateAnchorId(subjectId);
    return;
  }

  assert(false, "attestation.subject_type is invalid");
}

function validateAttestationIssuerId(
  issuerType: AttestationIssuerType,
  issuerId: string,
): void {
  if (issuerType === "producer") {
    validateProducerId(issuerId);
    return;
  }

  if (issuerType === "owner") {
    validateOwnerId(issuerId);
    return;
  }

  assert(false, "attestation.issuer.issuer_type is invalid");
}

export function assertValidAttestationObject(value: unknown): asserts value is AttestationObject {
  assert(isRecord(value), "attestation object must be an object");
  assert(
    value.schema_version === MEMORY_SCHEMA_VERSION,
    "attestation.schema_version must be 1.0.0",
  );
  assert(typeof value.attestation_id === "string", "attestation.attestation_id is required");
  validateAttestationId(value.attestation_id);
  assert(typeof value.subject_id === "string", "attestation.subject_id is required");
  assert(
    ["memory", "binding", "producer", "owner", "attestation", "anchor"].includes(
      String(value.subject_type),
    ),
    "attestation.subject_type is invalid",
  );
  validateAttestationSubjectId(
    value.subject_type as AttestationSubjectType,
    value.subject_id,
  );
  assert(
    [
      "producer_signature",
      "human_review",
      "enterprise_approval",
      "execution_proof",
      "compliance_check",
      "binding_verification",
      "anchor_confirmation",
    ].includes(String(value.kind)),
    "attestation.kind is invalid",
  );

  assert(isRecord(value.issuer), "attestation.issuer is required");
  assert(typeof value.issuer.issuer_id === "string", "attestation.issuer.issuer_id is required");
  assert(
    ["producer", "owner"].includes(String(value.issuer.issuer_type)),
    "attestation.issuer.issuer_type is invalid",
  );
  validateAttestationIssuerId(
    value.issuer.issuer_type as AttestationIssuerType,
    value.issuer.issuer_id,
  );

  assert(isRecord(value.evidence), "attestation.evidence is required");
  assert(
    typeof value.evidence.method === "string" && value.evidence.method.trim().length > 0,
    "attestation.evidence.method is required",
  );
  assertHash("attestation.evidence.hash", value.evidence.hash);

  assert(
    ["issued", "revoked"].includes(String(value.status)),
    "attestation.status is invalid",
  );

  assert(isRecord(value.timestamps), "attestation.timestamps is required");
  assertTimestamp("attestation.timestamps.issued_at", value.timestamps.issued_at, true);
  assertTimestamp("attestation.timestamps.revoked_at", value.timestamps.revoked_at);
  assertValidAttestationLifecycle(value as unknown as AttestationObject);
}

export function assertValidAttestationLifecycle(attestation: AttestationObject): void {
  if (attestation.status === "issued") {
    assert(
      attestation.timestamps.revoked_at === undefined,
      "issued attestation must not include timestamps.revoked_at",
    );
    return;
  }

  if (attestation.status === "revoked") {
    assert(
      attestation.timestamps.revoked_at !== undefined,
      "revoked attestation must include timestamps.revoked_at",
    );
  }
}

export function assertValidAttestationTransition(
  previousStatus: AttestationStatus,
  nextAttestation: AttestationObject,
): void {
  assertValidAttestationObject(nextAttestation);
  const nextStatus = nextAttestation.status;
  const allowed =
    previousStatus === nextStatus
    || (previousStatus === "issued" && nextStatus === "revoked");

  assert(
    allowed,
    `attestation transition ${previousStatus} -> ${nextStatus} is invalid`,
  );
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
  assert(typeof value.memory_id === "string", "memory_id is required");
  validateMemoryId(value.memory_id);

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
  validateProducerId(value.producer.producer_id);
  assert(["agent", "model", "application", "organization", "human"].includes(String(value.producer.producer_type)), "producer.producer_type is invalid");

  assert(isRecord(value.ownership), "ownership is required");
  assert(typeof value.ownership.owner_id === "string" && value.ownership.owner_id.length > 0, "ownership.owner_id is required");
  validateOwnerId(value.ownership.owner_id);
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
