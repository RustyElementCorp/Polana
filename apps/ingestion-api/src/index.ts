import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve, join } from "node:path";
import { JsonlLedgerClient } from "@polana/ledger";
import {
  type Ed25519KeyPairPem,
  generateEd25519KeyPairPem,
} from "@polana/signer";
import {
  createAndRecordMemoryObject,
  getRecordedMemoryObject,
  verifyRecordedMemoryObject,
  type CreateMemoryInput,
} from "@polana/sdk";
import { LocalStorageClient } from "@polana/storage-client";

const host = process.env.POLANA_API_HOST ?? "127.0.0.1";
const port = Number(process.env.POLANA_API_PORT ?? "8787");
const baseDir = resolve(process.cwd(), ".polana");
const storage = new LocalStorageClient(join(baseDir, "storage"));
const ledger = new JsonlLedgerClient(join(baseDir, "ledger", "records.jsonl"));
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

function extractMemoryId(url: string, suffix?: string): string | null {
  const pathname = new URL(url, `http://${host}:${port}`).pathname;
  const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const base = suffix ? `/memories/` : "/memories/";

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

async function handleCreate(request: IncomingMessage, response: ServerResponse): Promise<void> {
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
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "invalid request",
    });
  }
}

async function handleGet(memoryId: string, response: ServerResponse): Promise<void> {
  const record = await getRecordedMemoryObject(memoryId, ledger);
  if (!record) {
    sendJson(response, 404, { error: "memory not found" });
    return;
  }

  sendJson(response, 200, record);
}

async function handleVerify(memoryId: string, response: ServerResponse): Promise<void> {
  const result = await verifyRecordedMemoryObject(memoryId, storage, ledger);
  sendJson(response, result.ok ? 200 : 404, result);
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = request.url ?? "/";

  if (method === "GET" && new URL(url, `http://${host}:${port}`).pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && new URL(url, `http://${host}:${port}`).pathname === "/memories") {
    await handleCreate(request, response);
    return;
  }

  const verifyMemoryId = extractMemoryId(url, "/verify");
  if (method === "GET" && verifyMemoryId) {
    await handleVerify(verifyMemoryId, response);
    return;
  }

  const memoryId = extractMemoryId(url);
  if (method === "GET" && memoryId) {
    await handleGet(memoryId, response);
    return;
  }

  sendJson(response, 404, { error: "route not found" });
});

server.listen(port, host, () => {
  console.log(`Polana ingestion API listening on http://${host}:${port}`);
});
