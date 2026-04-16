import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { JsonlBindingLedgerClient, JsonlLedgerClient } from "@polana/ledger";
import {
  type Ed25519KeyPairPem,
  generateEd25519KeyPairPem,
} from "@polana/signer";
import {
  createAndRecordBindingObject,
  createAndRecordMemoryObject,
  exportRecordedBindingObject,
  exportRecordedMemoryObject,
  getRecordedBindingObject,
  getRecordedMemoryObject,
  importRecordedBindingBundle,
  importRecordedMemoryBundle,
  listRecordedBindingObjects,
  listRecordedMemoryObjects,
  normalizePolanaError,
  verifyRecordedMemoryObject,
  type CreateBindingInput,
  type CreateMemoryInput,
  type ExportedBindingBundle,
  type ExportedMemoryBundle,
} from "@polana/sdk";
import { LocalStorageClient } from "@polana/storage-client";

const host = process.env.POLANA_API_HOST ?? "127.0.0.1";
const port = Number(process.env.POLANA_API_PORT ?? "8787");
const baseDir = resolve(process.cwd(), ".polana");
const storage = new LocalStorageClient(join(baseDir, "storage"));
const ledger = new JsonlLedgerClient(join(baseDir, "ledger", "records.jsonl"));
const bindingLedger = new JsonlBindingLedgerClient(join(baseDir, "ledger", "bindings.jsonl"));
const signingKeyPath = join(baseDir, "keys", "ingestion-api-ed25519.json");

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

function sendError(response: ServerResponse, statusCode: number, error: unknown): void {
  const normalized = normalizePolanaError(error);
  sendJson(response, statusCode, {
    ok: false,
    error: normalized,
  });
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

function getUrl(url: string): URL {
  return new URL(url, `http://${host}:${port}`);
}

function toBindingSubjectType(value: string | null): CreateBindingInput["subject_type"] | undefined {
  if (value === "producer" || value === "owner" || value === "attestation" || value === "anchor") {
    return value;
  }
  return undefined;
}

function toBindingVerificationStatus(
  value: string | null,
): CreateBindingInput["verification"]["status"] | undefined {
  if (value === "claimed" || value === "verified" || value === "revoked") {
    return value;
  }
  return undefined;
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

async function handleCreateMemory(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const input = await readJsonBody<CreateMemoryInput>(request);
    const signer = await loadOrCreateSigningKey();
    const entry = await createAndRecordMemoryObject(
      {
        ...input,
        signer: input.signer ?? {
          algorithm: "ed25519",
          private_key_pem: signer.private_key_pem,
          public_key_pem: signer.public_key_pem,
          signer: signer.key_id,
        },
      },
      storage,
      ledger,
    );
    sendJson(response, 201, entry);
  } catch (error) {
    sendError(response, 400, error);
  }
}

async function handleListMemories(url: string, response: ServerResponse): Promise<void> {
  const query = getUrl(url).searchParams;
  const records = await listRecordedMemoryObjects(ledger, {
    memory_id: query.get("memory_id") ?? undefined,
    producer_id: query.get("producer_id") ?? undefined,
    owner_id: query.get("owner_id") ?? undefined,
    policy_id: query.get("policy_id") ?? undefined,
    tag: query.get("tag") ?? undefined,
  });
  sendJson(response, 200, records);
}

async function handleImportMemory(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const bundle = await readJsonBody<ExportedMemoryBundle>(request);
    const entry = await importRecordedMemoryBundle(bundle, storage, ledger);
    sendJson(response, 201, entry);
  } catch (error) {
    sendError(response, 400, error);
  }
}

async function handleGetMemory(memoryId: string, response: ServerResponse): Promise<void> {
  const record = await getRecordedMemoryObject(memoryId, ledger);
  if (!record) {
    sendError(response, 404, new Error("memory not found"));
    return;
  }

  sendJson(response, 200, record);
}

async function handleExportMemory(memoryId: string, response: ServerResponse): Promise<void> {
  try {
    const bundle = await exportRecordedMemoryObject(memoryId, storage, ledger);
    sendJson(response, 200, bundle);
  } catch (error) {
    sendError(response, 404, error);
  }
}

async function handleVerifyMemory(memoryId: string, response: ServerResponse): Promise<void> {
  const result = await verifyRecordedMemoryObject(memoryId, storage, ledger);
  sendJson(response, result.ok ? 200 : 404, result);
}

async function handleCreateBinding(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const input = await readJsonBody<CreateBindingInput>(request);
    const entry = await createAndRecordBindingObject(input, storage, bindingLedger);
    sendJson(response, 201, entry);
  } catch (error) {
    sendError(response, 400, error);
  }
}

async function handleListBindings(url: string, response: ServerResponse): Promise<void> {
  const query = getUrl(url).searchParams;
  const records = await listRecordedBindingObjects(bindingLedger, {
    binding_id: query.get("binding_id") ?? undefined,
    subject_id: query.get("subject_id") ?? undefined,
    subject_type: toBindingSubjectType(query.get("subject_type")),
    verification_status: toBindingVerificationStatus(query.get("verification_status")),
    network: query.get("network") ?? undefined,
    scheme: query.get("scheme") ?? undefined,
  });
  sendJson(response, 200, records);
}

async function handleImportBinding(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const bundle = await readJsonBody<ExportedBindingBundle>(request);
    const entry = await importRecordedBindingBundle(bundle, storage, bindingLedger);
    sendJson(response, 201, entry);
  } catch (error) {
    sendError(response, 400, error);
  }
}

async function handleGetBinding(bindingId: string, response: ServerResponse): Promise<void> {
  const record = await getRecordedBindingObject(bindingId, bindingLedger);
  if (!record) {
    sendError(response, 404, new Error("binding not found"));
    return;
  }

  sendJson(response, 200, record);
}

async function handleExportBinding(bindingId: string, response: ServerResponse): Promise<void> {
  try {
    const bundle = await exportRecordedBindingObject(bindingId, storage, bindingLedger);
    sendJson(response, 200, bundle);
  } catch (error) {
    sendError(response, 404, error);
  }
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = request.url ?? "/";
  const pathname = getUrl(url).pathname;

  if (method === "GET" && pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && pathname === "/memories") {
    await handleCreateMemory(request, response);
    return;
  }

  if (method === "GET" && pathname === "/memories") {
    await handleListMemories(url, response);
    return;
  }

  if (method === "POST" && pathname === "/memories/import") {
    await handleImportMemory(request, response);
    return;
  }

  const verifyMemoryId = extractResourceId(url, "/memories", "/verify");
  if (method === "GET" && verifyMemoryId) {
    await handleVerifyMemory(verifyMemoryId, response);
    return;
  }

  const exportMemoryId = extractResourceId(url, "/memories", "/export");
  if (method === "GET" && exportMemoryId) {
    await handleExportMemory(exportMemoryId, response);
    return;
  }

  const memoryId = extractResourceId(url, "/memories");
  if (method === "GET" && memoryId) {
    await handleGetMemory(memoryId, response);
    return;
  }

  if (method === "POST" && pathname === "/bindings") {
    await handleCreateBinding(request, response);
    return;
  }

  if (method === "GET" && pathname === "/bindings") {
    await handleListBindings(url, response);
    return;
  }

  if (method === "POST" && pathname === "/bindings/import") {
    await handleImportBinding(request, response);
    return;
  }

  const exportBindingId = extractResourceId(url, "/bindings", "/export");
  if (method === "GET" && exportBindingId) {
    await handleExportBinding(exportBindingId, response);
    return;
  }

  const bindingId = extractResourceId(url, "/bindings");
  if (method === "GET" && bindingId) {
    await handleGetBinding(bindingId, response);
    return;
  }

  sendError(response, 404, new Error("route not found"));
});

server.listen(port, host, () => {
  console.log(`Polana ingestion API listening on http://${host}:${port}`);
});
