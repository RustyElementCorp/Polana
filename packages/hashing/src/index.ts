import { createHash } from "node:crypto";
import {
  type MemoryObject,
  MEMORY_SCHEMA_VERSION,
  assertValidMemoryObject,
} from "@polana/memory-schema";

export type CanonicalHashInput = Omit<MemoryObject, "memory_id" | "integrity" | "anchors">;

function normalizeString(value: string): string {
  return value.normalize("NFC");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown, path: string[] = []): unknown {
  if (typeof value === "string") {
    return normalizeString(value);
  }

  if (Array.isArray(value)) {
    const next = value.map((item) => canonicalize(item, path));
    if (path[path.length - 1] === "tags") {
      return [...next].sort((a, b) => String(a).localeCompare(String(b)));
    }
    return next;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null)
      .map(([key, entryValue]) => [key, canonicalize(entryValue, [...path, key])] as const)
      .filter(([, entryValue]) => {
        if (Array.isArray(entryValue)) {
          return entryValue.length > 0;
        }
        if (isPlainObject(entryValue)) {
          return Object.keys(entryValue).length > 0;
        }
        return true;
      })
      .sort(([left], [right]) => left.localeCompare(right));

    return Object.fromEntries(entries);
  }

  return value;
}

export function toCanonicalHashInput(memoryObject: MemoryObject): CanonicalHashInput {
  assertValidMemoryObject(memoryObject);

  const { memory_id: _memoryId, integrity: _integrity, anchors: _anchors, ...hashInput } = memoryObject;
  return hashInput;
}

export function canonicalizeMemoryObject(memoryObject: MemoryObject): CanonicalHashInput {
  const hashInput = toCanonicalHashInput(memoryObject);
  return canonicalize(hashInput) as CanonicalHashInput;
}

export function serializeCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashCanonicalMemoryObject(memoryObject: MemoryObject): string {
  const canonicalJson = serializeCanonicalJson(toCanonicalHashInput(memoryObject));
  return createHash("sha256").update(canonicalJson, "utf8").digest("hex");
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

export function deriveMemoryIdFromHash(hashHex: string): string {
  if (!/^[a-f0-9]{64}$/.test(hashHex)) {
    throw new Error("hashHex must be a lowercase sha256 hex digest");
  }

  const bytes = Uint8Array.from(Buffer.from(hashHex, "hex"));
  return `mem_${toBase32LowerNoPadding(bytes)}`;
}

export function createMemoryObjectWithDerivedIdentity(
  input: Omit<MemoryObject, "memory_id" | "integrity">,
): MemoryObject {
  const draft: MemoryObject = {
    ...input,
    schema_version: MEMORY_SCHEMA_VERSION,
    memory_id: "mem_placeholder_temporary",
    integrity: {
      canonical_hash: "0".repeat(64),
      hash_algorithm: "sha256",
    },
  };

  const canonicalHash = hashCanonicalMemoryObject(draft);
  return {
    ...draft,
    memory_id: deriveMemoryIdFromHash(canonicalHash),
    integrity: {
      canonical_hash: canonicalHash,
      hash_algorithm: "sha256",
    },
  };
}
