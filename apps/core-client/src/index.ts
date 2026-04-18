import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { JsonlAttestationLedgerClient, JsonlBindingLedgerClient, JsonlLedgerClient } from "@polana/ledger";
import {
  type Ed25519KeyPairPem,
  generateEd25519KeyPairPem,
} from "@polana/signer";
import {
  createAndRecordAttestationObject,
  createAndRecordBindingObject,
  createAndRecordMemoryObject,
  exportRecordedBindingObject,
  exportRecordedMemoryObject,
  getRecordedAttestationObject,
  getRecordedBindingObject,
  getRecordedMemoryObject,
  importRecordedMemoryBundle,
  listRecordedAttestationObjects,
  listRecordedBindingObjects,
  listRecordedMemoryObjects,
  normalizePolanaError,
  verifyRecordedMemoryObject,
  type ExportedMemoryBundle,
} from "@polana/sdk";
import { LocalStorageClient } from "@polana/storage-client";

const host = process.env.POLANA_CLIENT_HOST ?? "127.0.0.1";
const port = Number(process.env.POLANA_CLIENT_PORT ?? "3004");
const baseDir = resolve(process.cwd(), ".polana");
const storage = new LocalStorageClient(join(baseDir, "storage"));
const ledger = new JsonlLedgerClient(join(baseDir, "ledger", "records.jsonl"));
const bindingLedger = new JsonlBindingLedgerClient(join(baseDir, "ledger", "bindings.jsonl"));
const attestationLedger = new JsonlAttestationLedgerClient(join(baseDir, "ledger", "attestations.jsonl"));
const signingKeyPath = join(baseDir, "keys", "core-client-ed25519.json");

interface FlowCreateRequest {
  response_text?: string;
  producer_display_name?: string;
  owner_label?: string;
  visibility?: "public" | "restricted" | "private";
  tags?: string;
  network?: string;
  address?: string;
  scheme?: string;
}

interface ImportBundleRequest {
  bundle?: ExportedMemoryBundle;
}

interface CreateAttestationRequest {
  subject_id?: string;
  subject_type?: "memory" | "binding";
  kind?:
    | "producer_signature"
    | "human_review"
    | "enterprise_approval"
    | "execution_proof"
    | "compliance_check"
    | "binding_verification"
    | "anchor_confirmation";
}

async function loadOrCreateSigningKey(): Promise<Ed25519KeyPairPem> {
  try {
    const existing = await readFile(signingKeyPath, "utf8");
    return JSON.parse(existing) as Ed25519KeyPairPem;
  } catch {
    const generated = generateEd25519KeyPairPem();
    await mkdir(dirname(signingKeyPath), { recursive: true });
    await writeFile(signingKeyPath, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
    return generated;
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendError(response: ServerResponse, statusCode: number, error: unknown): void {
  sendJson(response, statusCode, {
    ok: false,
    error: normalizePolanaError(error),
  });
}

function getUrl(url: string): URL {
  return new URL(url, `http://${host}:${port}`);
}

function extractResourceId(url: string, basePath: string, suffix?: string): string | null {
  const pathname = getUrl(url).pathname;
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const base = `${basePath}/`;

  if (suffix) {
    if (!normalized.endsWith(suffix)) {
      return null;
    }
    const withoutSuffix = normalized.slice(0, -suffix.length);
    if (!withoutSuffix.startsWith(base)) {
      return null;
    }
    return withoutSuffix.slice(base.length);
  }

  if (!normalized.startsWith(base)) {
    return null;
  }

  return normalized.slice(base.length);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new Error("request body is empty");
  }

  return JSON.parse(raw) as T;
}

function toTags(raw: string | undefined): string[] | undefined {
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function getTimelinePreview(records: Awaited<ReturnType<typeof listRecordedMemoryObjects>>) {
  return records
    .slice()
    .reverse()
    .slice(0, 8)
    .map((record) => ({
      memory_id: record.entry.memory_id,
      recorded_at: record.entry.recorded_at,
      producer_id: record.memory.producer.producer_id,
      owner_id: record.memory.ownership.owner_id,
      preview:
        record.memory.content.payload_summary?.preview
        ?? record.memory.tags?.join(", ")
        ?? "memory object",
      visibility: record.memory.policy?.visibility ?? "public",
      tags: record.memory.tags ?? [],
    }));
}

function getBindingPreview(records: Awaited<ReturnType<typeof listRecordedBindingObjects>>) {
  return records
    .slice()
    .reverse()
    .slice(0, 8)
    .map((record) => ({
      binding_id: record.entry.binding_id,
      recorded_at: record.entry.recorded_at,
      subject_id: record.entry.subject_id,
      network: record.binding.external_ref.network,
      address: record.binding.external_ref.address,
      status: record.binding.verification.status,
    }));
}

function getAttestationPreview(records: Awaited<ReturnType<typeof listRecordedAttestationObjects>>) {
  return records
    .slice()
    .reverse()
    .slice(0, 8)
    .map((record) => ({
      attestation_id: record.entry.attestation_id,
      recorded_at: record.entry.recorded_at,
      subject_id: record.entry.subject_id,
      subject_type: record.entry.subject_type,
      kind: record.attestation.kind,
      status: record.attestation.status,
      issuer_id: record.attestation.issuer.issuer_id,
    }));
}

function getIndexSummary(
  memories: Awaited<ReturnType<typeof listRecordedMemoryObjects>>,
  bindings: Awaited<ReturnType<typeof listRecordedBindingObjects>>,
  attestations: Awaited<ReturnType<typeof listRecordedAttestationObjects>>,
) {
  const uniqueOwners = new Set(memories.map((record) => record.memory.ownership.owner_id));
  const uniqueProducers = new Set(memories.map((record) => record.memory.producer.producer_id));
  const boundSubjects = new Set(bindings.map((record) => record.entry.subject_id));
  const attestedSubjects = new Set(attestations.map((record) => record.entry.subject_id));

  return {
    memory_count: memories.length,
    binding_count: bindings.length,
    attestation_count: attestations.length,
    unique_owner_count: uniqueOwners.size,
    unique_producer_count: uniqueProducers.size,
    bound_subject_count: boundSubjects.size,
    attested_subject_count: attestedSubjects.size,
  };
}

async function buildMemoryDetail(memoryId: string) {
  const memoryRecord = await getRecordedMemoryObject(memoryId, ledger);
  if (!memoryRecord) {
    throw new Error("memory not found");
  }

  const verifyResult = await verifyRecordedMemoryObject(memoryId, storage, ledger);
  const relatedBindings = await listRecordedBindingObjects(bindingLedger);
  const relatedAttestations = await listRecordedAttestationObjects(attestationLedger, {
    subject_id: memoryId,
    subject_type: "memory",
  });
  const ownerId = memoryRecord.memory.ownership.owner_id;
  const producerId = memoryRecord.memory.producer.producer_id;
  const contentBody = new TextDecoder().decode(await storage.get(memoryRecord.entry.content_cid));

  return {
    memory: memoryRecord,
    verify_result: verifyResult,
    content_body: contentBody,
    related_bindings: relatedBindings.filter((record) =>
      record.entry.subject_id === ownerId || record.entry.subject_id === producerId
    ),
    related_attestations: relatedAttestations,
  };
}

async function buildBindingDetail(bindingId: string) {
  const bindingRecord = await getRecordedBindingObject(bindingId, bindingLedger);
  if (!bindingRecord) {
    throw new Error("binding not found");
  }

  const bindingBody = new TextDecoder().decode(await storage.get(bindingRecord.entry.content_cid));
  const relatedAttestations = await listRecordedAttestationObjects(attestationLedger, {
    subject_id: bindingId,
    subject_type: "binding",
  });
  const relatedMemories = (await listRecordedMemoryObjects(ledger)).filter((record) =>
    record.memory.ownership.owner_id === bindingRecord.entry.subject_id
    || record.memory.producer.producer_id === bindingRecord.entry.subject_id
  );

  return {
    binding: bindingRecord,
    content_body: bindingBody,
    related_memories: relatedMemories.slice(0, 8),
    related_attestations: relatedAttestations,
  };
}

async function handleCreateAttestation(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateAttestationRequest>(request);
    if (!body.subject_id || !body.subject_type) {
      throw new Error("subject_id and subject_type are required");
    }

    if (body.subject_type !== "memory" && body.subject_type !== "binding") {
      throw new Error("subject_type must be memory or binding");
    }

    const kind = body.kind ?? (body.subject_type === "memory" ? "human_review" : "binding_verification");
    const issuedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    const entry = await createAndRecordAttestationObject(
      {
        subject_id: body.subject_id,
        subject_type: body.subject_type,
        kind,
        issuer: {
          issuer_id: "prod_core_client_attestor",
          issuer_type: "producer",
        },
        evidence: {
          method: "core-client-issue",
          value: `issued from core-client for ${body.subject_type} ${body.subject_id}`,
        },
        status: "issued",
        timestamps: {
          issued_at: issuedAt,
        },
        notes: `client-issued ${kind} attestation`,
      },
      storage,
      attestationLedger,
    );

    const record = await getRecordedAttestationObject(entry.attestation_id, attestationLedger);

    sendJson(response, 201, {
      ok: true,
      entry,
      record,
    });
  } catch (error) {
    sendError(response, 400, error);
  }
}

async function handleCreateFlow(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody<FlowCreateRequest>(request);
    const responseText = body.response_text?.trim();
    if (!responseText) {
      throw new Error("response_text is required");
    }

    const signer = await loadOrCreateSigningKey();
    const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const tags = toTags(body.tags);
    const memoryEntry = await createAndRecordMemoryObject(
      {
        content_body: JSON.stringify(
          {
            response: responseText,
            owner_label: body.owner_label?.trim() || "Anonymous owner",
          },
          null,
          2,
        ),
        provenance: {
          model_name: "client-authored",
          model_version: "v0",
          provider: "polana-core-client",
          output_schema_version: "1.0.0",
          agent_runtime_version: "core-client-0.1.0",
        },
        producer: {
          producer_type: "application",
          display_name: body.producer_display_name?.trim() || "Polana Core Client",
        },
        ownership: {
          owner_type: "user",
          transferable: false,
        },
        timestamps: {
          created_at: createdAt,
          source_clock: "app",
        },
        policy: {
          policy_id: `client-${body.visibility ?? "public"}-v1`,
          visibility: body.visibility ?? "public",
          retention: "permanent",
        },
        tags,
        signer: {
          algorithm: "ed25519",
          private_key_pem: signer.private_key_pem,
          public_key_pem: signer.public_key_pem,
          signer: signer.key_id,
        },
      },
      storage,
      ledger,
    );

    const memoryRecord = await getRecordedMemoryObject(memoryEntry.memory_id, ledger);
    if (!memoryRecord) {
      throw new Error("memory record was not found after creation");
    }

    const verifyResult = await verifyRecordedMemoryObject(memoryEntry.memory_id, storage, ledger);
    let bindingEntry: Awaited<ReturnType<typeof createAndRecordBindingObject>> | null = null;

    if (body.network?.trim() && body.address?.trim() && body.scheme?.trim()) {
      bindingEntry = await createAndRecordBindingObject(
        {
          subject_id: memoryRecord.memory.ownership.owner_id,
          subject_type: "owner",
          external_ref: {
            network: body.network.trim(),
            address: body.address.trim(),
            scheme: body.scheme.trim(),
          },
          verification: {
            status: "claimed",
            method: "core-client-form",
          },
          timestamps: {
            created_at: createdAt,
          },
          notes: `binding created from core-client flow for ${memoryEntry.memory_id}`,
        },
        storage,
        bindingLedger,
      );
    }

    const memories = await listRecordedMemoryObjects(ledger);
    const bindings = await listRecordedBindingObjects(bindingLedger);

    sendJson(response, 201, {
      ok: true,
      flow: {
        memory_entry: memoryEntry,
        verify_result: verifyResult,
        binding_entry: bindingEntry,
      },
      timeline: getTimelinePreview(memories),
      bindings: getBindingPreview(bindings),
    });
  } catch (error) {
    sendError(response, 400, error);
  }
}

async function handleRecentFlow(response: ServerResponse): Promise<void> {
  const memories = await listRecordedMemoryObjects(ledger);
  const bindings = await listRecordedBindingObjects(bindingLedger);
  const attestations = await listRecordedAttestationObjects(attestationLedger);
  sendJson(response, 200, {
    ok: true,
    timeline: getTimelinePreview(memories),
    bindings: getBindingPreview(bindings),
    attestations: getAttestationPreview(attestations),
    index_summary: getIndexSummary(memories, bindings, attestations),
  });
}

async function handleMemoryDetail(memoryId: string, response: ServerResponse): Promise<void> {
  try {
    const detail = await buildMemoryDetail(memoryId);
    sendJson(response, 200, {
      ok: true,
      detail,
    });
  } catch (error) {
    sendError(response, 404, error);
  }
}

async function handleBindingDetail(bindingId: string, response: ServerResponse): Promise<void> {
  try {
    const detail = await buildBindingDetail(bindingId);
    sendJson(response, 200, {
      ok: true,
      detail,
    });
  } catch (error) {
    sendError(response, 404, error);
  }
}

async function handleExportBinding(bindingId: string, response: ServerResponse): Promise<void> {
  try {
    const bundle = await exportRecordedBindingObject(bindingId, storage, bindingLedger);
    sendJson(response, 200, {
      ok: true,
      bundle,
    });
  } catch (error) {
    sendError(response, 404, error);
  }
}

async function handleExportMemory(memoryId: string, response: ServerResponse): Promise<void> {
  try {
    const bundle = await exportRecordedMemoryObject(memoryId, storage, ledger);
    sendJson(response, 200, {
      ok: true,
      bundle,
    });
  } catch (error) {
    sendError(response, 404, error);
  }
}

async function handleImportFlow(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody<ImportBundleRequest>(request);
    if (!body.bundle) {
      throw new Error("bundle is required");
    }

    const entry = await importRecordedMemoryBundle(body.bundle, storage, ledger);
    const verifyResult = await verifyRecordedMemoryObject(entry.memory_id, storage, ledger);
    const memories = await listRecordedMemoryObjects(ledger);
    const bindings = await listRecordedBindingObjects(bindingLedger);

    sendJson(response, 201, {
      ok: true,
      imported_entry: entry,
      verify_result: verifyResult,
      timeline: getTimelinePreview(memories),
      bindings: getBindingPreview(bindings),
    });
  } catch (error) {
    sendError(response, 400, error);
  }
}

function appHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Polana Core Client</title>
    <style>
      :root {
        --bg: #f4efe7;
        --panel: rgba(255, 252, 246, 0.92);
        --line: rgba(33, 29, 24, 0.12);
        --text: #201b16;
        --muted: #6b6258;
        --accent: #c85d34;
        --accent-2: #254441;
        --shadow: 0 18px 60px rgba(31, 23, 17, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(200, 93, 52, 0.18), transparent 32%),
          radial-gradient(circle at top right, rgba(37, 68, 65, 0.12), transparent 28%),
          linear-gradient(180deg, #f9f6f0 0%, var(--bg) 100%);
      }
      main {
        max-width: 1160px;
        margin: 0 auto;
        padding: 40px 20px 80px;
      }
      .hero {
        display: grid;
        gap: 14px;
        margin-bottom: 28px;
      }
      .eyebrow {
        font-family: "Courier New", monospace;
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent-2);
      }
      h1 {
        margin: 0;
        font-size: clamp(40px, 6vw, 78px);
        line-height: 0.95;
        letter-spacing: -0.04em;
      }
      .hero p {
        max-width: 760px;
        margin: 0;
        font-size: 18px;
        line-height: 1.6;
        color: var(--muted);
      }
      .grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 20px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 24px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }
      .panel h2 {
        margin: 0 0 14px;
        font-size: 28px;
      }
      .panel p {
        margin: 0 0 18px;
        color: var(--muted);
        line-height: 1.5;
      }
      .filter-panel {
        display: grid;
        gap: 12px;
        margin-bottom: 16px;
      }
      form {
        display: grid;
        gap: 14px;
      }
      .row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      label {
        display: grid;
        gap: 7px;
        font-size: 13px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--muted);
      }
      input, textarea, select, button {
        font: inherit;
      }
      input, textarea, select {
        width: 100%;
        border: 1px solid rgba(32, 27, 22, 0.12);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.8);
        padding: 14px 16px;
        color: var(--text);
      }
      textarea {
        min-height: 220px;
        resize: vertical;
      }
      button {
        border: none;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent), #e08d5b);
        color: white;
        padding: 14px 20px;
        font-weight: 700;
        cursor: pointer;
      }
      .secondary {
        background: transparent;
        color: var(--accent-2);
        border: 1px solid rgba(37, 68, 65, 0.2);
      }
      .stack {
        display: grid;
        gap: 16px;
      }
      .split {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .result, .list {
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 16px;
        background: rgba(255,255,255,0.64);
      }
      .result pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "SFMono-Regular", "Menlo", monospace;
        font-size: 12px;
        line-height: 1.5;
      }
      .item {
        padding: 14px 0;
        border-top: 1px solid var(--line);
      }
      .item:first-child { border-top: none; padding-top: 0; }
      .item strong {
        display: block;
        font-size: 15px;
      }
      .item span {
        display: block;
        color: var(--muted);
        font-size: 13px;
        margin-top: 4px;
      }
      .timeline-button {
        width: 100%;
        text-align: left;
        background: transparent;
        color: inherit;
        border: none;
        border-radius: 16px;
        padding: 0;
      }
      .timeline-button:hover strong {
        color: var(--accent);
      }
      .drawer {
        position: fixed;
        inset: 0;
        display: none;
        justify-content: flex-end;
        background: rgba(17, 12, 9, 0.24);
        z-index: 20;
      }
      .drawer.open {
        display: flex;
      }
      .drawer-panel {
        width: min(620px, 100vw);
        height: 100%;
        background: #fffaf3;
        border-left: 1px solid rgba(32, 27, 22, 0.12);
        box-shadow: -20px 0 60px rgba(22, 18, 14, 0.18);
        padding: 24px 20px 32px;
        overflow-y: auto;
      }
      .drawer-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
        margin-bottom: 18px;
      }
      .drawer-head h3 {
        margin: 0;
        font-size: 28px;
      }
      .drawer-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .drawer-meta {
        display: grid;
        gap: 8px;
        color: var(--muted);
        font-size: 14px;
      }
      .drawer-block {
        border-top: 1px solid var(--line);
        padding-top: 16px;
        margin-top: 16px;
      }
      .drawer-block h4 {
        margin: 0 0 10px;
        font-size: 16px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent-2);
      }
      .drawer-block pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "SFMono-Regular", "Menlo", monospace;
        font-size: 12px;
        line-height: 1.5;
      }
      .sectioned {
        display: grid;
        gap: 12px;
      }
      .summary-card {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 12px 14px;
        background: rgba(255,255,255,0.64);
      }
      .summary-card h5 {
        margin: 0 0 8px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent-2);
      }
      .summary-grid {
        display: grid;
        gap: 8px;
      }
      .summary-row {
        display: grid;
        grid-template-columns: 140px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }
      .summary-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
      }
      .summary-value {
        font-size: 14px;
        line-height: 1.5;
        word-break: break-word;
      }
      .summary-value.mono {
        font-family: "SFMono-Regular", "Menlo", monospace;
        font-size: 12px;
      }
      .summary-card details {
        margin-top: 8px;
      }
      .summary-card summary {
        cursor: pointer;
        color: var(--accent);
        font-size: 13px;
      }
      .summary-card details pre {
        margin-top: 10px;
      }
      .state-note {
        border: 1px dashed var(--line);
        border-radius: 16px;
        padding: 12px 14px;
        background: rgba(255,255,255,0.56);
      }
      .state-note strong {
        display: block;
        font-size: 13px;
        margin-bottom: 6px;
      }
      .state-note span {
        display: block;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .state-note.success {
        border-color: rgba(37, 68, 65, 0.26);
        background: rgba(37, 68, 65, 0.06);
      }
      .state-note.error {
        border-color: rgba(200, 93, 52, 0.28);
        background: rgba(200, 93, 52, 0.08);
      }
      .mini-list {
        display: grid;
        gap: 10px;
      }
      .mini-item {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 10px 12px;
        background: rgba(255,255,255,0.64);
      }
      .mini-item strong {
        display: block;
        font-size: 13px;
      }
      .mini-item span {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
      }
      .pill {
        display: inline-block;
        margin-right: 6px;
        margin-top: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(37, 68, 65, 0.08);
        color: var(--accent-2);
        font-size: 12px;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 10px;
      }
      .status {
        font-family: "Courier New", monospace;
        font-size: 12px;
        color: var(--accent);
      }
      .toolbar {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 8px;
      }
      .toolbar.meta-toolbar {
        margin-top: 0;
      }
      .small {
        padding: 10px 14px;
        font-size: 14px;
      }
      .bundle-area {
        min-height: 180px;
      }
      .count {
        font-family: "Courier New", monospace;
        font-size: 12px;
        color: var(--accent-2);
      }
      .preset-strip {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .preset-button.active {
        background: linear-gradient(135deg, var(--accent-2), #3a6a65);
        color: white;
        border-color: transparent;
      }
      @media (max-width: 920px) {
        .grid, .row, .split { grid-template-columns: 1fr; }
        main { padding: 24px 14px 48px; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="eyebrow">Polana Core Client Flow</div>
        <h1>Write once.<br/>Bind later.<br/>Verify always.</h1>
        <p>
          This client sits directly on top of the closed local core. A user writes an output,
          the app turns it into a memory object, optionally binds an external address to the owner,
          and immediately verifies the record.
        </p>
      </section>
      <section class="grid">
        <article class="panel">
          <h2>Create Memory Flow</h2>
          <p>
            Use this form to simulate the first user-facing touchpoint: authored response, ownership,
            optional external identity binding, and immediate verification.
          </p>
          <form id="flow-form">
            <div>
              <label>Scenario Presets</label>
              <div class="preset-strip">
                <button type="button" class="secondary small preset-button" data-preset="public_memory">Public Memory</button>
                <button type="button" class="secondary small preset-button" data-preset="identity_claim">Identity Claim</button>
                <button type="button" class="secondary small preset-button" data-preset="private_handoff">Private Handoff</button>
              </div>
            </div>
            <label>
              Response Text
              <textarea name="response_text" placeholder="Describe what the user or agent produced." required></textarea>
            </label>
            <div class="row">
              <label>
                Producer Display Name
                <input name="producer_display_name" value="Polana Core Client" />
              </label>
              <label>
                Owner Label
                <input name="owner_label" value="Local User" />
              </label>
            </div>
            <div class="row">
              <label>
                Visibility
                <select name="visibility">
                  <option value="public">public</option>
                  <option value="restricted">restricted</option>
                  <option value="private">private</option>
                </select>
              </label>
              <label>
                Tags
                <input name="tags" placeholder="demo, client, memory" />
              </label>
            </div>
            <div class="row">
              <label>
                External Network
                <input name="network" placeholder="solana" />
              </label>
              <label>
                Binding Scheme
                <input name="scheme" placeholder="solana-ed25519-v1" />
              </label>
            </div>
            <label>
              External Address
              <input name="address" placeholder="Optional. If present, a claimed owner binding is created." />
            </label>
            <div class="row">
              <button type="submit">Record Flow</button>
              <button type="button" class="secondary" id="refresh-button">Refresh Timeline</button>
            </div>
          </form>
        </article>
        <aside class="stack">
          <section class="panel result">
            <div class="meta">
              <h2>Latest Flow Result</h2>
              <div class="status" id="result-status">idle</div>
            </div>
            <div id="result-view" class="sectioned">
              <div class="state-note empty">
                <strong>Ready</strong>
                <span>Submit the form to create a new memory flow.</span>
              </div>
            </div>
            <div class="toolbar">
              <button type="button" class="secondary small" id="export-latest-button">Export Latest Memory</button>
            </div>
          </section>
          <section class="panel result">
            <div class="meta">
              <h2>Portable Bundle</h2>
              <div class="status" id="bundle-status">ready</div>
            </div>
            <div class="split">
              <div>
                <p>Export the latest memory bundle and inspect exactly what could be shared or moved.</p>
                <div id="bundle-view" class="sectioned">
                  <div class="state-note empty">
                    <strong>No Bundle Loaded</strong>
                    <span>Export a memory or binding bundle to inspect the portable payload here.</span>
                  </div>
                </div>
              </div>
              <div>
                <p>Paste a previously exported memory bundle here to re-import it into the local core.</p>
                <textarea id="bundle-input" class="bundle-area" placeholder='{"bundle_version":"1.0.0", ...}'></textarea>
                <div class="toolbar">
                  <button type="button" class="small" id="import-bundle-button">Import Bundle</button>
                </div>
              </div>
            </div>
          </section>
          <section class="panel list">
            <div class="meta">
              <h2>Index Summary</h2>
            </div>
            <div id="index-summary-view" class="sectioned">
              <div class="state-note empty">
                <strong>No Index Data Yet</strong>
                <span>Record memories, bindings, and attestations to populate the local index summary.</span>
              </div>
            </div>
          </section>
          <section class="panel list">
            <div class="meta">
              <h2>Recent Memories</h2>
              <div class="count" id="memory-count">0 shown</div>
            </div>
            <div class="filter-panel">
              <div class="row">
                <label>
                  Search
                  <input id="memory-search" placeholder="memory id, owner, producer, tag" />
                </label>
                <label>
                  Visibility
                  <select id="memory-visibility-filter">
                    <option value="all">all</option>
                    <option value="public">public</option>
                    <option value="restricted">restricted</option>
                    <option value="private">private</option>
                  </select>
                </label>
              </div>
            </div>
            <div id="timeline-view"></div>
          </section>
          <section class="panel list">
            <div class="meta">
              <h2>Recent Bindings</h2>
              <div class="count" id="binding-count">0 shown</div>
            </div>
            <div class="filter-panel">
              <div class="row">
                <label>
                  Search
                  <input id="binding-search" placeholder="binding id, subject, network, address" />
                </label>
                <label>
                  Status
                  <select id="binding-status-filter">
                    <option value="all">all</option>
                    <option value="claimed">claimed</option>
                    <option value="verified">verified</option>
                    <option value="revoked">revoked</option>
                  </select>
                </label>
              </div>
            </div>
            <div id="binding-view"></div>
          </section>
          <section class="panel list">
            <div class="meta">
              <h2>Recent Attestations</h2>
              <div class="count" id="attestation-count">0 shown</div>
            </div>
            <div class="filter-panel">
              <div class="row">
                <label>
                  Search
                  <input id="attestation-search" placeholder="attestation id, subject, issuer, kind" />
                </label>
                <label>
                  Status
                  <select id="attestation-status-filter">
                    <option value="all">all</option>
                    <option value="issued">issued</option>
                    <option value="revoked">revoked</option>
                  </select>
                </label>
              </div>
            </div>
            <div id="attestation-view"></div>
          </section>
        </aside>
      </section>
    </main>
    <aside class="drawer" id="detail-drawer">
      <div class="drawer-panel">
        <div class="drawer-head">
          <div>
            <div class="eyebrow">Memory Detail</div>
            <h3 id="detail-title">No memory selected</h3>
            <div class="drawer-actions">
              <button type="button" class="secondary small" id="detail-export-button">Export This Memory</button>
              <button type="button" class="secondary small" id="detail-copy-bundle-button">Copy Bundle</button>
              <button type="button" class="secondary small" id="detail-copy-content-button">Copy Content</button>
              <button type="button" class="secondary small" id="detail-attest-button">Issue Review Attestation</button>
            </div>
          </div>
          <button type="button" class="secondary small" id="close-detail-button">Close</button>
        </div>
        <div class="drawer-meta" id="detail-meta">Click a memory in the timeline to inspect it.</div>
        <section class="drawer-block">
          <h4>Content</h4>
          <div id="detail-content" class="sectioned">No content loaded.</div>
        </section>
        <section class="drawer-block">
          <h4>Provenance</h4>
          <div id="detail-provenance" class="sectioned">No provenance loaded.</div>
        </section>
        <section class="drawer-block">
          <h4>Verify</h4>
          <div id="detail-verify" class="sectioned">No verification loaded.</div>
        </section>
        <section class="drawer-block">
          <h4>Related Bindings</h4>
          <div id="detail-bindings" class="mini-list">No related bindings loaded.</div>
        </section>
        <section class="drawer-block">
          <h4>Attestations</h4>
          <div id="detail-attestations" class="sectioned">No attestation view wired yet.</div>
        </section>
      </div>
    </aside>
    <aside class="drawer" id="binding-drawer">
      <div class="drawer-panel">
        <div class="drawer-head">
          <div>
            <div class="eyebrow">Binding Detail</div>
            <h3 id="binding-detail-title">No binding selected</h3>
            <div class="drawer-actions">
              <button type="button" class="secondary small" id="binding-export-button">Export This Binding</button>
              <button type="button" class="secondary small" id="binding-copy-bundle-button">Copy Bundle</button>
              <button type="button" class="secondary small" id="binding-copy-content-button">Copy Binding</button>
              <button type="button" class="secondary small" id="binding-attest-button">Issue Binding Attestation</button>
            </div>
          </div>
          <button type="button" class="secondary small" id="close-binding-detail-button">Close</button>
        </div>
        <div class="drawer-meta" id="binding-detail-meta">Click a binding to inspect it.</div>
        <section class="drawer-block">
          <h4>Binding Object</h4>
          <div id="binding-detail-content" class="sectioned">No binding loaded.</div>
        </section>
        <section class="drawer-block">
          <h4>Related Memories</h4>
          <div id="binding-detail-memories" class="mini-list"></div>
        </section>
        <section class="drawer-block">
          <h4>Attestations</h4>
          <div id="binding-detail-attestations" class="sectioned">No attestation view wired yet.</div>
        </section>
      </div>
    </aside>
    <script>
      const form = document.getElementById("flow-form");
      const resultView = document.getElementById("result-view");
      const resultStatus = document.getElementById("result-status");
      const indexSummaryView = document.getElementById("index-summary-view");
      const timelineView = document.getElementById("timeline-view");
      const bindingView = document.getElementById("binding-view");
      const attestationView = document.getElementById("attestation-view");
      const refreshButton = document.getElementById("refresh-button");
      const exportLatestButton = document.getElementById("export-latest-button");
      const bundleStatus = document.getElementById("bundle-status");
      const bundleView = document.getElementById("bundle-view");
      const bundleInput = document.getElementById("bundle-input");
      const importBundleButton = document.getElementById("import-bundle-button");
      const detailDrawer = document.getElementById("detail-drawer");
      const bindingDrawer = document.getElementById("binding-drawer");
      const closeDetailButton = document.getElementById("close-detail-button");
      const closeBindingDetailButton = document.getElementById("close-binding-detail-button");
      const detailTitle = document.getElementById("detail-title");
      const detailMeta = document.getElementById("detail-meta");
      const detailContent = document.getElementById("detail-content");
      const detailProvenance = document.getElementById("detail-provenance");
      const detailVerify = document.getElementById("detail-verify");
      const detailBindings = document.getElementById("detail-bindings");
      const detailAttestations = document.getElementById("detail-attestations");
      const bindingDetailTitle = document.getElementById("binding-detail-title");
      const bindingDetailMeta = document.getElementById("binding-detail-meta");
      const bindingDetailContent = document.getElementById("binding-detail-content");
      const bindingDetailMemories = document.getElementById("binding-detail-memories");
      const bindingDetailAttestations = document.getElementById("binding-detail-attestations");
      const bindingExportButton = document.getElementById("binding-export-button");
      const bindingCopyBundleButton = document.getElementById("binding-copy-bundle-button");
      const bindingCopyContentButton = document.getElementById("binding-copy-content-button");
      const bindingAttestButton = document.getElementById("binding-attest-button");
      const detailExportButton = document.getElementById("detail-export-button");
      const detailCopyBundleButton = document.getElementById("detail-copy-bundle-button");
      const detailCopyContentButton = document.getElementById("detail-copy-content-button");
      const detailAttestButton = document.getElementById("detail-attest-button");
      const memorySearch = document.getElementById("memory-search");
      const memoryVisibilityFilter = document.getElementById("memory-visibility-filter");
      const bindingSearch = document.getElementById("binding-search");
      const bindingStatusFilter = document.getElementById("binding-status-filter");
      const attestationSearch = document.getElementById("attestation-search");
      const attestationStatusFilter = document.getElementById("attestation-status-filter");
      const presetButtons = Array.from(document.querySelectorAll("[data-preset]"));
      const memoryCount = document.getElementById("memory-count");
      const bindingCount = document.getElementById("binding-count");
      const attestationCount = document.getElementById("attestation-count");
      const storageKey = "polana.coreClient.v1";
      const responseField = form.querySelector('[name="response_text"]');
      const producerField = form.querySelector('[name="producer_display_name"]');
      const ownerField = form.querySelector('[name="owner_label"]');
      const visibilityField = form.querySelector('[name="visibility"]');
      const tagsField = form.querySelector('[name="tags"]');
      const networkField = form.querySelector('[name="network"]');
      const schemeField = form.querySelector('[name="scheme"]');
      const addressField = form.querySelector('[name="address"]');
      let latestTimeline = [];
      let latestBindings = [];
      let latestAttestations = [];
      let latestIndexSummary = null;
      let latestMemoryId = null;
      let selectedMemoryId = null;
      let selectedBindingId = null;
      let latestDetail = null;
      let latestBindingDetail = null;
      let selectedPreset = null;

      const scenarioPresets = {
        public_memory: {
          label: "Public Memory",
          response_text: "The agent summarized a public research note, linked its provenance, and recorded the answer as a portable memory object for later review.",
          producer_display_name: "Polana Research Client",
          owner_label: "Open Researcher",
          visibility: "public",
          tags: "demo,public,provenance,research",
          network: "solana",
          scheme: "solana-ed25519-v1",
          address: "7public111111111111111111111111111111111111"
        },
        identity_claim: {
          label: "Identity Claim",
          response_text: "The operator asserted control over an external wallet and requested a claimed binding so later attestations can verify that address relationship.",
          producer_display_name: "Polana Identity Desk",
          owner_label: "Wallet Holder",
          visibility: "restricted",
          tags: "identity,binding,claim,review",
          network: "solana",
          scheme: "solana-ed25519-v1",
          address: "7claim1111111111111111111111111111111111111"
        },
        private_handoff: {
          label: "Private Handoff",
          response_text: "An internal agent drafted a private handoff note for another operator, keeping the memory local and intentionally leaving external identity unbound.",
          producer_display_name: "Polana Ops Relay",
          owner_label: "Internal Operator",
          visibility: "private",
          tags: "handoff,private,ops",
          network: "",
          scheme: "",
          address: ""
        }
      };

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function formatValue(value) {
        if (value === null || value === undefined || value === "") {
          return "—";
        }
        if (typeof value === "boolean") {
          return value ? "true" : "false";
        }
        if (Array.isArray(value)) {
          return value.length ? value.join(", ") : "—";
        }
        return String(value);
      }

      function renderSummaryCard(title, rows, raw) {
        const filteredRows = rows.filter((row) => row && row.label);
        const grid = filteredRows.length
          ? filteredRows.map((row) => \`
              <div class="summary-row">
                <div class="summary-label">\${escapeHtml(row.label)}</div>
                <div class="summary-value \${row.mono ? "mono" : ""}">\${escapeHtml(formatValue(row.value))}</div>
              </div>
            \`).join("")
          : '<div class="summary-value">No structured fields.</div>';

        const rawBlock = raw === undefined
          ? ""
          : \`
              <details>
                <summary>View Raw</summary>
                <pre>\${escapeHtml(typeof raw === "string" ? raw : JSON.stringify(raw, null, 2))}</pre>
              </details>
            \`;

        return \`
          <div class="summary-card">
            <h5>\${escapeHtml(title)}</h5>
            <div class="summary-grid">\${grid}</div>
            \${rawBlock}
          </div>
        \`;
      }

      function renderStateNote(kind, title, body) {
        return \`
          <div class="state-note \${escapeHtml(kind)}">
            <strong>\${escapeHtml(title)}</strong>
            <span>\${escapeHtml(body)}</span>
          </div>
        \`;
      }

      function renderContentSection(contentBody) {
        try {
          const parsed = JSON.parse(contentBody);
          return [
            renderSummaryCard("Content Summary", [
              { label: "Response", value: parsed.response },
              { label: "Owner Label", value: parsed.owner_label },
            ], parsed),
          ].join("");
        } catch {
          return renderSummaryCard("Content Body", [
            { label: "Text", value: contentBody },
          ], contentBody);
        }
      }

      function renderProvenanceSection(provenance) {
        return renderSummaryCard("Provenance Summary", [
          { label: "Model", value: provenance?.model_name },
          { label: "Version", value: provenance?.model_version },
          { label: "Provider", value: provenance?.provider },
          { label: "Output Schema", value: provenance?.output_schema_version },
          { label: "Runtime", value: provenance?.agent_runtime_version },
        ], provenance);
      }

      function renderVerifySection(verifyResult) {
        return renderSummaryCard("Verification Summary", [
          { label: "Overall", value: verifyResult?.ok ? "valid" : "invalid" },
          { label: "Memory ID", value: verifyResult?.memory_id, mono: true },
          { label: "Canonical Hash", value: verifyResult?.canonical_hash_match },
          { label: "Signature", value: verifyResult?.signature_valid },
          { label: "Content CID", value: verifyResult?.content_cid_match },
        ], verifyResult);
      }

      function renderBindingSection(bindingRecord, rawBody) {
        return [
          renderSummaryCard("Binding Summary", [
            { label: "Binding ID", value: bindingRecord?.entry?.binding_id, mono: true },
            { label: "Subject", value: bindingRecord?.entry?.subject_id, mono: true },
            { label: "Subject Type", value: bindingRecord?.binding?.subject_type },
            { label: "Network", value: bindingRecord?.binding?.external_ref?.network },
            { label: "Scheme", value: bindingRecord?.binding?.external_ref?.scheme },
            { label: "Address", value: bindingRecord?.binding?.external_ref?.address, mono: true },
          ]),
          renderSummaryCard("Verification", [
            { label: "Status", value: bindingRecord?.binding?.verification?.status },
            { label: "Method", value: bindingRecord?.binding?.verification?.method },
            { label: "Verified At", value: bindingRecord?.binding?.verification?.verified_at },
            { label: "Revoked At", value: bindingRecord?.binding?.verification?.revoked_at },
          ], (() => {
            try {
              return JSON.parse(rawBody);
            } catch {
              return rawBody;
            }
          })()),
        ].join("");
      }

      function renderFlowResult(flow) {
        if (!flow || !flow.memory_entry) {
          return renderStateNote("empty", "No Flow Result", "Create or import a memory flow to see a structured summary here.");
        }

        return [
          renderStateNote(
            "success",
            "Flow Recorded",
            "The local core recorded a new memory object. The detail drawer opens immediately so you can inspect the next attestation layer."
          ),
          renderSummaryCard("Memory Created", [
            { label: "Memory ID", value: flow.memory_entry.memory_id, mono: true },
            { label: "Recorded At", value: flow.memory_entry.recorded_at },
            { label: "Content CID", value: flow.memory_entry.content_cid, mono: true },
            { label: "Verification", value: flow.verify_result?.ok ? "valid" : "needs review" },
          ], flow.memory_entry),
          flow.binding_entry
            ? renderSummaryCard("Binding Created", [
                { label: "Binding ID", value: flow.binding_entry.binding_id, mono: true },
                { label: "Recorded At", value: flow.binding_entry.recorded_at },
                { label: "Subject ID", value: flow.binding_entry.subject_id, mono: true },
              ], flow.binding_entry)
            : renderStateNote(
                "empty",
                "No Binding Created",
                "This flow recorded only a memory object. Add network, scheme, and address fields when you want to create an owner binding too."
              ),
          renderAttestationPlaceholder("memory", flow.memory_entry.memory_id),
        ].join("");
      }

      function renderBundleSummary(payload, kindLabel) {
        const bundle = payload?.bundle;
        if (!bundle) {
          return renderStateNote("empty", "No Bundle Loaded", "Export a memory or binding bundle to inspect the portable payload here.");
        }

        const record = bundle.record || {};
        const body = bundle.memory_body || bundle.binding_body || {};

        return [
          renderStateNote(
            "success",
            kindLabel + " Bundle Ready",
            "This portable bundle can be copied, moved, and re-imported into another local Polana core environment."
          ),
          renderSummaryCard("Bundle Summary", [
            { label: "Bundle Version", value: bundle.bundle_version },
            { label: "Kind", value: kindLabel.toLowerCase() },
            { label: "Primary ID", value: record.memory_id || record.binding_id, mono: true },
            { label: "Recorded At", value: record.recorded_at },
            { label: "Content CID", value: record.content_cid, mono: true },
          ], bundle),
          renderSummaryCard("Portable Body", [
            { label: "Schema Version", value: body.schema_version },
            { label: "Producer", value: body.producer?.producer_id || body.subject_id, mono: true },
            { label: "Owner / Subject", value: body.ownership?.owner_id || body.subject_id, mono: true },
            { label: "Tags", value: body.tags },
          ]),
        ].join("");
      }

      function renderBundleError(message, payload) {
        return renderSummaryCard("Bundle Error", [
          { label: "Message", value: message },
        ], payload);
      }

      function renderAttestationPlaceholder(subjectType, subjectId) {
        const template = subjectType === "memory"
          ? {
              kind: "human_review",
              issuer: "prod_review_agent_placeholder",
              evidence: "linked memory review, provenance check, or operator approval",
              status: "issued",
            }
          : {
              kind: "binding_verification",
              issuer: "prod_identity_checker_placeholder",
              evidence: "wallet challenge response, signature proof, or operator override",
              status: "issued",
            };

        return [
          renderStateNote(
            "empty",
            "Attestation Layer Pending",
            "This " + subjectType + " can already host attestations. The client is showing the expected shape before live attestation query and runtime surfaces are wired."
          ),
          renderSummaryCard("Planned Attestation Shape", [
            { label: "Subject Type", value: subjectType },
            { label: "Subject ID", value: subjectId, mono: true },
            { label: "Kind", value: template.kind },
            { label: "Issuer", value: template.issuer, mono: true },
            { label: "Status", value: template.status },
            { label: "Evidence", value: template.evidence },
          ], {
            attestation_id: "att_placeholder_example",
            subject_type: subjectType,
            subject_id: subjectId,
            kind: template.kind,
            issuer: {
              issuer_id: template.issuer,
              issuer_type: "producer",
            },
            status: template.status,
            evidence: {
              value: template.evidence,
            },
          }),
        ].join("");
      }

      function renderAttestationRecords(records, subjectType, subjectId) {
        if (!records || records.length === 0) {
          return [
            renderStateNote(
              "empty",
              "No Attestations Yet",
              "Issue the first attestation for this " + subjectType + " to turn the planned shape into a recorded object."
            ),
            renderAttestationPlaceholder(subjectType, subjectId),
          ].join("");
        }

        return [
          renderStateNote(
            "success",
            "Attestations Recorded",
            String(records.length) + " attestation record(s) currently point at this " + subjectType + "."
          ),
          records.map((record) => renderSummaryCard("Attestation " + record.entry.attestation_id, [
            { label: "Kind", value: record.attestation.kind },
            { label: "Status", value: record.attestation.status },
            { label: "Issuer", value: record.attestation.issuer.issuer_id, mono: true },
            { label: "Method", value: record.attestation.evidence.method },
            { label: "Issued At", value: record.attestation.timestamps.issued_at },
          ], record.attestation)).join(""),
        ].join("");
      }

      async function issueAttestation(subjectType, subjectId, kind) {
        const response = await fetch("/api/attestations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subject_id: subjectId,
            subject_type: subjectType,
            kind,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error?.message || "attestation create failed");
        }
        return payload;
      }

      function setActivePreset(presetName) {
        selectedPreset = presetName || null;
        presetButtons.forEach((button) => {
          button.classList.toggle("active", button.getAttribute("data-preset") === selectedPreset);
        });
      }

      function applyScenarioPreset(presetName, options = {}) {
        const preset = scenarioPresets[presetName];
        if (!preset) {
          return;
        }

        responseField.value = preset.response_text;
        producerField.value = preset.producer_display_name;
        ownerField.value = preset.owner_label;
        visibilityField.value = preset.visibility;
        tagsField.value = preset.tags;
        networkField.value = preset.network;
        schemeField.value = preset.scheme;
        addressField.value = preset.address;
        setActivePreset(presetName);
        if (!options.silent) {
          resultView.innerHTML = renderStateNote(
            "success",
            preset.label + " Loaded",
            "The form is prefilled with a representative client flow. Record it to generate memory, binding, and attestation-ready surfaces."
          );
          resultStatus.textContent = "preset";
          persistUiState();
        }
      }

      function loadUiState() {
        try {
          return JSON.parse(localStorage.getItem(storageKey) || "{}");
        } catch {
          return {};
        }
      }

      function loadUrlState() {
        const params = new URLSearchParams(window.location.search);
        return {
          memorySearch: params.get("ms") || "",
          memoryVisibility: params.get("mv") || "",
          bindingSearch: params.get("bs") || "",
          bindingStatus: params.get("bv") || "",
          selectedMemoryId: params.get("memory") || null,
          selectedBindingId: params.get("binding") || null,
        };
      }

      function persistUrlState() {
        const params = new URLSearchParams(window.location.search);
        const upsert = (key, value, defaultValue = "") => {
          if (!value || value === defaultValue) {
            params.delete(key);
            return;
          }
          params.set(key, value);
        };

        upsert("ms", memorySearch.value);
        upsert("mv", memoryVisibilityFilter.value, "all");
        upsert("bs", bindingSearch.value);
        upsert("bv", bindingStatusFilter.value, "all");
        upsert("memory", selectedMemoryId);
        upsert("binding", selectedBindingId);

        const next = params.toString();
        const target = next ? "?" + next : window.location.pathname;
        window.history.replaceState(null, "", target);
      }

      function persistUiState() {
        const payload = {
          memorySearch: memorySearch.value,
          memoryVisibility: memoryVisibilityFilter.value,
          bindingSearch: bindingSearch.value,
          bindingStatus: bindingStatusFilter.value,
          attestationSearch: attestationSearch.value,
          attestationStatus: attestationStatusFilter.value,
          selectedPreset,
          bundleInput: bundleInput.value,
          bundleView: bundleView.innerHTML,
          bundleStatus: bundleStatus.textContent,
          resultView: resultView.innerHTML,
          resultStatus: resultStatus.textContent,
          selectedMemoryId,
          selectedBindingId,
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
        persistUrlState();
      }

      function restoreUiState() {
        const localState = loadUiState();
        const urlState = loadUrlState();
        memorySearch.value = urlState.memorySearch || localState.memorySearch || "";
        memoryVisibilityFilter.value = urlState.memoryVisibility || localState.memoryVisibility || "all";
        bindingSearch.value = urlState.bindingSearch || localState.bindingSearch || "";
        bindingStatusFilter.value = urlState.bindingStatus || localState.bindingStatus || "all";
        attestationSearch.value = localState.attestationSearch || "";
        attestationStatusFilter.value = localState.attestationStatus || "all";
        if (localState.selectedPreset && scenarioPresets[localState.selectedPreset]) {
          applyScenarioPreset(localState.selectedPreset, { silent: true });
        } else {
          setActivePreset(null);
        }
        bundleInput.value = localState.bundleInput || "";
        bundleView.innerHTML = localState.bundleView || renderStateNote("empty", "No Bundle Loaded", "Export a memory or binding bundle to inspect the portable payload here.");
        bundleStatus.textContent = localState.bundleStatus || "ready";
        resultView.innerHTML = localState.resultView || renderStateNote("empty", "Ready", "Submit the form to create a new memory flow.");
        resultStatus.textContent = localState.resultStatus || "idle";
        selectedMemoryId = urlState.selectedMemoryId || localState.selectedMemoryId || null;
        selectedBindingId = urlState.selectedBindingId || localState.selectedBindingId || null;
      }

      function renderTimeline(items) {
        latestMemoryId = items.length ? items[0].memory_id : null;
        if (!items.length) {
          timelineView.innerHTML = renderStateNote("empty", "No Memories Yet", "Record a memory from the form, then inspect and export it from the timeline.");
          memoryCount.textContent = "0 shown";
          return;
        }
        timelineView.innerHTML = items.map((item) => \`
          <div class="item">
            <button type="button" class="timeline-button" data-memory-id="\${item.memory_id}">
              <strong>\${item.memory_id}</strong>
              <span>\${item.preview}</span>
              <span>\${item.recorded_at} • owner \${item.owner_id}</span>
              <div>\${item.tags.map((tag) => \`<span class="pill">\${tag}</span>\`).join("")}</div>
            </button>
          </div>
        \`).join("");

        timelineView.querySelectorAll("[data-memory-id]").forEach((element) => {
          element.addEventListener("click", () => {
            openDetail(element.getAttribute("data-memory-id"));
          });
        });
        memoryCount.textContent = \`\${items.length} shown\`;
        persistUiState();
      }

      function renderIndexSummary(summary) {
        if (!summary) {
          indexSummaryView.innerHTML = renderStateNote("empty", "No Index Data Yet", "Record memories, bindings, and attestations to populate the local index summary.");
          return;
        }

        indexSummaryView.innerHTML = [
          renderSummaryCard("Coverage", [
            { label: "Memories", value: summary.memory_count },
            { label: "Bindings", value: summary.binding_count },
            { label: "Attestations", value: summary.attestation_count },
          ]),
          renderSummaryCard("Subjects", [
            { label: "Unique Owners", value: summary.unique_owner_count },
            { label: "Unique Producers", value: summary.unique_producer_count },
            { label: "Bound Subjects", value: summary.bound_subject_count },
            { label: "Attested Subjects", value: summary.attested_subject_count },
          ]),
        ].join("");
      }

      function renderBindings(items) {
        if (!items.length) {
          bindingView.innerHTML = renderStateNote("empty", "No Bindings Yet", "Add an external network, scheme, and address in the form to create a claimed owner binding.");
          bindingCount.textContent = "0 shown";
          return;
        }
        bindingView.innerHTML = items.map((item) => \`
          <div class="item">
            <button type="button" class="timeline-button" data-binding-id="\${item.binding_id}">
              <strong>\${item.binding_id}</strong>
              <span>\${item.network} • \${item.address}</span>
              <span>\${item.recorded_at} • \${item.status} • \${item.subject_id}</span>
            </button>
          </div>
        \`).join("");
        bindingView.querySelectorAll("[data-binding-id]").forEach((element) => {
          element.addEventListener("click", () => {
            openBindingDetail(element.getAttribute("data-binding-id"));
          });
        });
        bindingCount.textContent = \`\${items.length} shown\`;
        persistUiState();
      }

      function renderAttestations(items) {
        if (!items.length) {
          attestationView.innerHTML = renderStateNote("empty", "No Attestations Yet", "Issue an attestation from a memory or binding drawer to populate this index.");
          attestationCount.textContent = "0 shown";
          return;
        }

        attestationView.innerHTML = items.map((item) => \`
          <div class="item">
            <strong>\${item.attestation_id}</strong>
            <span>\${item.kind} • \${item.status}</span>
            <span>\${item.recorded_at} • \${item.subject_type} \${item.subject_id}</span>
            <span>issuer \${item.issuer_id}</span>
          </div>
        \`).join("");
        attestationCount.textContent = \`\${items.length} shown\`;
        persistUiState();
      }

      function applyMemoryFilters() {
        const search = memorySearch.value.trim().toLowerCase();
        const visibility = memoryVisibilityFilter.value;
        const filtered = latestTimeline.filter((item) => {
          const visibilityMatch = visibility === "all" || item.visibility === visibility;
          const searchMatch = !search || [
            item.memory_id,
            item.owner_id,
            item.producer_id,
            item.preview,
            ...(item.tags || [])
          ].some((value) => String(value).toLowerCase().includes(search));
          return visibilityMatch && searchMatch;
        });
        renderTimeline(filtered);
      }

      function applyBindingFilters() {
        const search = bindingSearch.value.trim().toLowerCase();
        const status = bindingStatusFilter.value;
        const filtered = latestBindings.filter((item) => {
          const statusMatch = status === "all" || item.status === status;
          const searchMatch = !search || [
            item.binding_id,
            item.subject_id,
            item.network,
            item.address
          ].some((value) => String(value).toLowerCase().includes(search));
          return statusMatch && searchMatch;
        });
        renderBindings(filtered);
      }

      function applyAttestationFilters() {
        const search = attestationSearch.value.trim().toLowerCase();
        const status = attestationStatusFilter.value;
        const filtered = latestAttestations.filter((item) => {
          const statusMatch = status === "all" || item.status === status;
          const searchMatch = !search || [
            item.attestation_id,
            item.subject_id,
            item.subject_type,
            item.kind,
            item.issuer_id,
          ].some((value) => String(value).toLowerCase().includes(search));
          return statusMatch && searchMatch;
        });
        renderAttestations(filtered);
      }

      async function refreshFlow() {
        const response = await fetch("/api/flow/recent");
        const payload = await response.json();
        latestTimeline = payload.timeline || [];
        latestBindings = payload.bindings || [];
        latestAttestations = payload.attestations || [];
        latestIndexSummary = payload.index_summary || null;
        renderIndexSummary(latestIndexSummary);
        applyMemoryFilters();
        applyBindingFilters();
        applyAttestationFilters();
      }

      async function exportLatestMemory() {
        if (!latestMemoryId) {
          bundleStatus.textContent = "no-memory";
          bundleView.innerHTML = renderStateNote("empty", "No Memory Available", "There is no recorded memory to export yet.");
          return;
        }

        await exportMemoryToBundle(latestMemoryId);
      }

      async function exportMemoryToBundle(memoryId) {
        bundleStatus.textContent = "exporting";
        const response = await fetch(\`/api/memories/\${memoryId}/export\`);
        const payload = await response.json();
        bundleView.innerHTML = response.ok
          ? renderBundleSummary(payload, "Memory")
          : renderBundleError(payload?.error?.message || "memory export failed", payload);
        if (payload.bundle) {
          bundleInput.value = JSON.stringify(payload.bundle, null, 2);
        }
        bundleStatus.textContent = response.ok ? "exported" : "error";
        persistUiState();
        return payload;
      }

      async function exportBindingToBundle(bindingId) {
        bundleStatus.textContent = "exporting";
        const response = await fetch(\`/api/bindings/\${bindingId}/export\`);
        const payload = await response.json();
        bundleView.innerHTML = response.ok
          ? renderBundleSummary(payload, "Binding")
          : renderBundleError(payload?.error?.message || "binding export failed", payload);
        if (payload.bundle) {
          bundleInput.value = JSON.stringify(payload.bundle, null, 2);
        }
        bundleStatus.textContent = response.ok ? "exported" : "error";
        persistUiState();
        return payload;
      }

      async function importBundle() {
        const raw = bundleInput.value.trim();
        if (!raw) {
          bundleStatus.textContent = "empty";
          return;
        }

        bundleStatus.textContent = "importing";
        const response = await fetch("/api/flow/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bundle: JSON.parse(raw) }),
        });
        const payload = await response.json();
        resultView.innerHTML = response.ok
          ? renderFlowResult({
              memory_entry: payload.imported_entry,
              verify_result: payload.verify_result,
              binding_entry: null,
            })
          : renderSummaryCard("Import Error", [
              { label: "Message", value: payload?.error?.message || "import failed" },
            ], payload);
        resultStatus.textContent = response.ok ? "imported" : "error";
        bundleStatus.textContent = response.ok ? "imported" : "error";
        persistUiState();
        await refreshFlow();
        if (response.ok && payload.imported_entry?.memory_id) {
          await openDetail(payload.imported_entry.memory_id);
        }
      }

      async function openDetail(memoryId) {
        if (!memoryId) {
          return;
        }

        selectedMemoryId = memoryId;
        selectedBindingId = null;
        latestDetail = null;
        detailDrawer.classList.add("open");
        bindingDrawer.classList.remove("open");
        detailTitle.textContent = memoryId;
        detailMeta.textContent = "loading";
        detailContent.innerHTML = renderStateNote("empty", "Loading", "Fetching content and memory metadata.");
        detailProvenance.innerHTML = renderStateNote("empty", "Loading", "Fetching provenance fields.");
        detailVerify.innerHTML = renderStateNote("empty", "Loading", "Running local verification checks.");
        detailBindings.innerHTML = renderStateNote("empty", "Loading", "Looking for bindings attached to this memory owner or producer.");
        detailAttestations.innerHTML = renderStateNote("empty", "Loading", "Looking for attestations attached to this memory.");

        const response = await fetch(\`/api/memories/\${memoryId}/detail\`);
        const payload = await response.json();

        if (!response.ok) {
          detailMeta.textContent = payload?.error?.message || "detail load failed";
          detailContent.innerHTML = renderSummaryCard("Error", [
            { label: "Message", value: payload?.error?.message || "detail load failed" },
          ], payload);
          detailProvenance.innerHTML = renderStateNote("error", "Unavailable", "Provenance could not be loaded for this memory.");
          detailVerify.innerHTML = renderStateNote("error", "Unavailable", "Verification details could not be loaded for this memory.");
          detailBindings.innerHTML = renderStateNote("error", "Unavailable", "Related bindings could not be loaded for this memory.");
          detailAttestations.innerHTML = renderAttestationPlaceholder("memory", memoryId);
          return;
        }

        const detail = payload.detail;
        latestDetail = detail;
        detailMeta.innerHTML = [
          \`recorded \${detail.memory.entry.recorded_at}\`,
          \`producer \${detail.memory.memory.producer.producer_id}\`,
          \`owner \${detail.memory.memory.ownership.owner_id}\`,
          \`visibility \${detail.memory.memory.policy?.visibility || "public"}\`
        ].join("<br/>");
        detailContent.innerHTML = renderContentSection(detail.content_body);
        detailProvenance.innerHTML = renderProvenanceSection(detail.memory.memory.provenance);
        detailVerify.innerHTML = renderVerifySection(detail.verify_result);
        if (detail.related_bindings.length === 0) {
          detailBindings.innerHTML = renderStateNote("empty", "No Related Bindings", "This memory is currently standalone.");
        } else {
          detailBindings.innerHTML = detail.related_bindings.map((record) => \`
            <div class="mini-item">
              <button type="button" class="timeline-button" data-detail-binding-id="\${record.entry.binding_id}">
                <strong>\${record.entry.binding_id}</strong>
                <span>\${record.binding.external_ref.network} • \${record.binding.external_ref.address}</span>
                <span>\${record.binding.verification.status} • \${record.entry.subject_id}</span>
              </button>
            </div>
          \`).join("");
          detailBindings.querySelectorAll("[data-detail-binding-id]").forEach((element) => {
            element.addEventListener("click", () => {
              openBindingDetail(element.getAttribute("data-detail-binding-id"));
            });
          });
        }
        detailAttestations.innerHTML = renderAttestationRecords(
          detail.related_attestations,
          "memory",
          detail.memory.entry.memory_id,
        );
        persistUiState();
      }

      async function openBindingDetail(bindingId) {
        if (!bindingId) {
          return;
        }

        selectedBindingId = bindingId;
        selectedMemoryId = null;
        latestBindingDetail = null;
        bindingDrawer.classList.add("open");
        detailDrawer.classList.remove("open");
        bindingDetailTitle.textContent = bindingId;
        bindingDetailMeta.textContent = "loading";
        bindingDetailContent.innerHTML = renderStateNote("empty", "Loading", "Fetching binding content and verification metadata.");
        bindingDetailMemories.innerHTML = "";
        bindingDetailAttestations.innerHTML = renderStateNote("empty", "Loading", "Looking for attestations attached to this binding.");

        const response = await fetch(\`/api/bindings/\${bindingId}/detail\`);
        const payload = await response.json();

        if (!response.ok) {
          bindingDetailMeta.textContent = payload?.error?.message || "binding detail load failed";
          bindingDetailContent.innerHTML = renderSummaryCard("Error", [
            { label: "Message", value: payload?.error?.message || "binding detail load failed" },
          ], payload);
          bindingDetailMemories.innerHTML = renderStateNote("error", "Unavailable", "Related memories could not be loaded for this binding.");
          bindingDetailAttestations.innerHTML = renderAttestationPlaceholder("binding", bindingId);
          return;
        }

        const detail = payload.detail;
        latestBindingDetail = detail;
        bindingDetailMeta.innerHTML = [
          \`recorded \${detail.binding.entry.recorded_at}\`,
          \`subject \${detail.binding.entry.subject_id}\`,
          \`status \${detail.binding.binding.verification.status}\`,
          \`network \${detail.binding.binding.external_ref.network}\`
        ].join("<br/>");
        bindingDetailContent.innerHTML = renderBindingSection(detail.binding, detail.content_body);
        if (!detail.related_memories.length) {
          bindingDetailMemories.innerHTML = renderStateNote("empty", "No Related Memories", "No recorded memories currently point at this binding subject.");
        } else {
          bindingDetailMemories.innerHTML = detail.related_memories.map((record) => \`
            <div class="mini-item">
              <button type="button" class="timeline-button" data-related-memory-id="\${record.entry.memory_id}">
                <strong>\${record.entry.memory_id}</strong>
                <span>\${record.entry.recorded_at}</span>
                <span>\${record.memory.tags?.join(", ") || "memory object"}</span>
              </button>
            </div>
          \`).join("");
          bindingDetailMemories.querySelectorAll("[data-related-memory-id]").forEach((element) => {
            element.addEventListener("click", () => {
              bindingDrawer.classList.remove("open");
              openDetail(element.getAttribute("data-related-memory-id"));
            });
          });
        }
        bindingDetailAttestations.innerHTML = renderAttestationRecords(
          detail.related_attestations,
          "binding",
          detail.binding.entry.binding_id,
        );
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        resultStatus.textContent = "writing";
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        const response = await fetch("/api/flow/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        resultView.innerHTML = response.ok
          ? renderFlowResult(json.flow)
          : renderSummaryCard("Flow Error", [
              { label: "Message", value: json?.error?.message || "flow create failed" },
            ], json);
        resultStatus.textContent = response.ok ? "recorded" : "error";
        persistUiState();
        await refreshFlow();
        if (response.ok && json.flow?.memory_entry?.memory_id) {
          await openDetail(json.flow.memory_entry.memory_id);
        }
      });

      refreshButton.addEventListener("click", () => {
        refreshFlow().catch((error) => {
          resultView.innerHTML = renderSummaryCard("Refresh Error", [
            { label: "Message", value: String(error) },
          ], { error: String(error) });
          resultStatus.textContent = "error";
        });
      });

      exportLatestButton.addEventListener("click", () => {
        exportLatestMemory().catch((error) => {
          bundleView.innerHTML = renderBundleError(String(error), { error: String(error) });
          bundleStatus.textContent = "error";
        });
      });

      importBundleButton.addEventListener("click", () => {
        importBundle().catch((error) => {
          resultView.innerHTML = renderSummaryCard("Import Error", [
            { label: "Message", value: String(error) },
          ], { error: String(error) });
          resultStatus.textContent = "error";
          bundleStatus.textContent = "error";
        });
      });

      closeDetailButton.addEventListener("click", () => {
        detailDrawer.classList.remove("open");
        selectedMemoryId = null;
        persistUiState();
      });

      closeBindingDetailButton.addEventListener("click", () => {
        bindingDrawer.classList.remove("open");
        selectedBindingId = null;
        persistUiState();
      });

      detailDrawer.addEventListener("click", (event) => {
        if (event.target === detailDrawer) {
          detailDrawer.classList.remove("open");
          selectedMemoryId = null;
          persistUiState();
        }
      });

      bindingDrawer.addEventListener("click", (event) => {
        if (event.target === bindingDrawer) {
          bindingDrawer.classList.remove("open");
          selectedBindingId = null;
          persistUiState();
        }
      });

      bindingExportButton.addEventListener("click", () => {
        if (!selectedBindingId) {
          return;
        }

        exportBindingToBundle(selectedBindingId).catch((error) => {
          bundleView.innerHTML = renderBundleError(String(error), { error: String(error) });
          bundleStatus.textContent = "error";
        });
      });

      bindingCopyBundleButton.addEventListener("click", async () => {
        if (!selectedBindingId || !navigator.clipboard) {
          return;
        }

        const payload = await exportBindingToBundle(selectedBindingId);
        if (payload.bundle) {
          await navigator.clipboard.writeText(JSON.stringify(payload.bundle, null, 2));
          bundleStatus.textContent = "copied";
        }
      });

      bindingCopyContentButton.addEventListener("click", async () => {
        if (!latestBindingDetail || !navigator.clipboard) {
          return;
        }

        await navigator.clipboard.writeText(latestBindingDetail.content_body);
        bindingDetailMeta.innerHTML += "<br/>binding copied";
      });

      bindingAttestButton.addEventListener("click", async () => {
        if (!selectedBindingId) {
          return;
        }

        bindingDetailMeta.innerHTML += "<br/>issuing attestation";
        try {
          await issueAttestation("binding", selectedBindingId, "binding_verification");
          await openBindingDetail(selectedBindingId);
        } catch (error) {
          bindingDetailMeta.innerHTML += "<br/>" + escapeHtml(String(error));
        }
      });

      detailExportButton.addEventListener("click", () => {
        if (!selectedMemoryId) {
          return;
        }

        exportMemoryToBundle(selectedMemoryId).catch((error) => {
          bundleView.innerHTML = renderBundleError(String(error), { error: String(error) });
          bundleStatus.textContent = "error";
        });
      });

      detailCopyBundleButton.addEventListener("click", async () => {
        if (!selectedMemoryId || !navigator.clipboard) {
          return;
        }

        const payload = await exportMemoryToBundle(selectedMemoryId);
        if (payload.bundle) {
          await navigator.clipboard.writeText(JSON.stringify(payload.bundle, null, 2));
          bundleStatus.textContent = "copied";
        }
      });

      detailCopyContentButton.addEventListener("click", async () => {
        if (!latestDetail || !navigator.clipboard) {
          return;
        }

        await navigator.clipboard.writeText(latestDetail.content_body);
        detailMeta.innerHTML += "<br/>content copied";
        persistUiState();
      });

      detailAttestButton.addEventListener("click", async () => {
        if (!selectedMemoryId) {
          return;
        }

        detailMeta.innerHTML += "<br/>issuing attestation";
        try {
          await issueAttestation("memory", selectedMemoryId, "human_review");
          await openDetail(selectedMemoryId);
        } catch (error) {
          detailMeta.innerHTML += "<br/>" + escapeHtml(String(error));
        }
      });

      memorySearch.addEventListener("input", () => {
        applyMemoryFilters();
        persistUiState();
      });
      memoryVisibilityFilter.addEventListener("change", () => {
        applyMemoryFilters();
        persistUiState();
      });
      bindingSearch.addEventListener("input", () => {
        applyBindingFilters();
        persistUiState();
      });
      bindingStatusFilter.addEventListener("change", () => {
        applyBindingFilters();
        persistUiState();
      });
      attestationSearch.addEventListener("input", () => {
        applyAttestationFilters();
        persistUiState();
      });
      attestationStatusFilter.addEventListener("change", () => {
        applyAttestationFilters();
        persistUiState();
      });
      bundleInput.addEventListener("input", persistUiState);
      presetButtons.forEach((button) => {
        button.addEventListener("click", () => {
          applyScenarioPreset(button.getAttribute("data-preset"));
        });
      });

      restoreUiState();
      refreshFlow().catch((error) => {
        resultView.innerHTML = renderSummaryCard("Initial Load Error", [
          { label: "Message", value: String(error) },
        ], { error: String(error) });
        resultStatus.textContent = "error";
      });
      if (selectedMemoryId) {
        openDetail(selectedMemoryId).catch(() => {});
      }
      if (selectedBindingId) {
        openBindingDetail(selectedBindingId).catch(() => {});
      }
    </script>
  </body>
</html>`;
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = request.url ?? "/";

  if (method === "GET" && url === "/") {
    sendHtml(response, appHtml());
    return;
  }

  if (method === "GET" && url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && url === "/api/flow/recent") {
    await handleRecentFlow(response);
    return;
  }

  if (method === "POST" && url === "/api/flow/create") {
    await handleCreateFlow(request, response);
    return;
  }

  if (method === "POST" && url === "/api/flow/import") {
    await handleImportFlow(request, response);
    return;
  }

  if (method === "POST" && url === "/api/attestations") {
    await handleCreateAttestation(request, response);
    return;
  }

  const exportMemoryId = extractResourceId(url, "/api/memories", "/export");
  if (method === "GET" && exportMemoryId) {
    await handleExportMemory(exportMemoryId, response);
    return;
  }

  const detailMemoryId = extractResourceId(url, "/api/memories", "/detail");
  if (method === "GET" && detailMemoryId) {
    await handleMemoryDetail(detailMemoryId, response);
    return;
  }

  const detailBindingId = extractResourceId(url, "/api/bindings", "/detail");
  if (method === "GET" && detailBindingId) {
    await handleBindingDetail(detailBindingId, response);
    return;
  }

  const exportBindingId = extractResourceId(url, "/api/bindings", "/export");
  if (method === "GET" && exportBindingId) {
    await handleExportBinding(exportBindingId, response);
    return;
  }

  sendError(response, 404, new Error("route not found"));
});

server.listen(port, host, () => {
  console.log(`Polana core client listening on http://${host}:${port}`);
});
