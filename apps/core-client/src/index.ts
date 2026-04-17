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
  exportRecordedMemoryObject,
  getRecordedMemoryObject,
  importRecordedMemoryBundle,
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

async function buildMemoryDetail(memoryId: string) {
  const memoryRecord = await getRecordedMemoryObject(memoryId, ledger);
  if (!memoryRecord) {
    throw new Error("memory not found");
  }

  const verifyResult = await verifyRecordedMemoryObject(memoryId, storage, ledger);
  const relatedBindings = await listRecordedBindingObjects(bindingLedger);
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
  };
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
  sendJson(response, 200, {
    ok: true,
    timeline: getTimelinePreview(memories),
    bindings: getBindingPreview(bindings),
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
      .small {
        padding: 10px 14px;
        font-size: 14px;
      }
      .bundle-area {
        min-height: 180px;
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
            <pre id="result-view">Submit the form to create a new memory flow.</pre>
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
                <pre id="bundle-view">No bundle loaded yet.</pre>
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
            <h2>Recent Memories</h2>
            <div id="timeline-view"></div>
          </section>
          <section class="panel list">
            <h2>Recent Bindings</h2>
            <div id="binding-view"></div>
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
          </div>
          <button type="button" class="secondary small" id="close-detail-button">Close</button>
        </div>
        <div class="drawer-meta" id="detail-meta">Click a memory in the timeline to inspect it.</div>
        <section class="drawer-block">
          <h4>Content</h4>
          <pre id="detail-content">No content loaded.</pre>
        </section>
        <section class="drawer-block">
          <h4>Provenance</h4>
          <pre id="detail-provenance">No provenance loaded.</pre>
        </section>
        <section class="drawer-block">
          <h4>Verify</h4>
          <pre id="detail-verify">No verification loaded.</pre>
        </section>
        <section class="drawer-block">
          <h4>Related Bindings</h4>
          <pre id="detail-bindings">No related bindings loaded.</pre>
        </section>
      </div>
    </aside>
    <script>
      const form = document.getElementById("flow-form");
      const resultView = document.getElementById("result-view");
      const resultStatus = document.getElementById("result-status");
      const timelineView = document.getElementById("timeline-view");
      const bindingView = document.getElementById("binding-view");
      const refreshButton = document.getElementById("refresh-button");
      const exportLatestButton = document.getElementById("export-latest-button");
      const bundleStatus = document.getElementById("bundle-status");
      const bundleView = document.getElementById("bundle-view");
      const bundleInput = document.getElementById("bundle-input");
      const importBundleButton = document.getElementById("import-bundle-button");
      const detailDrawer = document.getElementById("detail-drawer");
      const closeDetailButton = document.getElementById("close-detail-button");
      const detailTitle = document.getElementById("detail-title");
      const detailMeta = document.getElementById("detail-meta");
      const detailContent = document.getElementById("detail-content");
      const detailProvenance = document.getElementById("detail-provenance");
      const detailVerify = document.getElementById("detail-verify");
      const detailBindings = document.getElementById("detail-bindings");
      let latestMemoryId = null;

      function renderTimeline(items) {
        latestMemoryId = items.length ? items[0].memory_id : null;
        if (!items.length) {
          timelineView.innerHTML = '<div class="item"><strong>No memories yet.</strong><span>Create one from the form.</span></div>';
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
      }

      function renderBindings(items) {
        if (!items.length) {
          bindingView.innerHTML = '<div class="item"><strong>No bindings yet.</strong><span>Add an external address in the form.</span></div>';
          return;
        }
        bindingView.innerHTML = items.map((item) => \`
          <div class="item">
            <strong>\${item.binding_id}</strong>
            <span>\${item.network} • \${item.address}</span>
            <span>\${item.recorded_at} • \${item.status} • \${item.subject_id}</span>
          </div>
        \`).join("");
      }

      async function refreshFlow() {
        const response = await fetch("/api/flow/recent");
        const payload = await response.json();
        renderTimeline(payload.timeline || []);
        renderBindings(payload.bindings || []);
      }

      async function exportLatestMemory() {
        if (!latestMemoryId) {
          bundleStatus.textContent = "no-memory";
          bundleView.textContent = "There is no recorded memory to export yet.";
          return;
        }

        bundleStatus.textContent = "exporting";
        const response = await fetch(\`/api/memories/\${latestMemoryId}/export\`);
        const payload = await response.json();
        bundleView.textContent = JSON.stringify(payload, null, 2);
        if (payload.bundle) {
          bundleInput.value = JSON.stringify(payload.bundle, null, 2);
        }
        bundleStatus.textContent = response.ok ? "exported" : "error";
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
        resultView.textContent = JSON.stringify(payload, null, 2);
        resultStatus.textContent = response.ok ? "imported" : "error";
        bundleStatus.textContent = response.ok ? "imported" : "error";
        await refreshFlow();
      }

      async function openDetail(memoryId) {
        if (!memoryId) {
          return;
        }

        detailDrawer.classList.add("open");
        detailTitle.textContent = memoryId;
        detailMeta.textContent = "loading";
        detailContent.textContent = "Loading content...";
        detailProvenance.textContent = "Loading provenance...";
        detailVerify.textContent = "Loading verify result...";
        detailBindings.textContent = "Loading related bindings...";

        const response = await fetch(\`/api/memories/\${memoryId}/detail\`);
        const payload = await response.json();

        if (!response.ok) {
          detailMeta.textContent = payload?.error?.message || "detail load failed";
          detailContent.textContent = JSON.stringify(payload, null, 2);
          detailProvenance.textContent = "Unavailable";
          detailVerify.textContent = "Unavailable";
          detailBindings.textContent = "Unavailable";
          return;
        }

        const detail = payload.detail;
        detailMeta.innerHTML = [
          \`recorded \${detail.memory.entry.recorded_at}\`,
          \`producer \${detail.memory.memory.producer.producer_id}\`,
          \`owner \${detail.memory.memory.ownership.owner_id}\`,
          \`visibility \${detail.memory.memory.policy?.visibility || "public"}\`
        ].join("<br/>");
        detailContent.textContent = detail.content_body;
        detailProvenance.textContent = JSON.stringify(detail.memory.memory.provenance, null, 2);
        detailVerify.textContent = JSON.stringify(detail.verify_result, null, 2);
        detailBindings.textContent = JSON.stringify(detail.related_bindings, null, 2);
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
        resultView.textContent = JSON.stringify(json, null, 2);
        resultStatus.textContent = response.ok ? "recorded" : "error";
        await refreshFlow();
      });

      refreshButton.addEventListener("click", () => {
        refreshFlow().catch((error) => {
          resultView.textContent = String(error);
          resultStatus.textContent = "error";
        });
      });

      exportLatestButton.addEventListener("click", () => {
        exportLatestMemory().catch((error) => {
          bundleView.textContent = String(error);
          bundleStatus.textContent = "error";
        });
      });

      importBundleButton.addEventListener("click", () => {
        importBundle().catch((error) => {
          resultView.textContent = String(error);
          resultStatus.textContent = "error";
          bundleStatus.textContent = "error";
        });
      });

      closeDetailButton.addEventListener("click", () => {
        detailDrawer.classList.remove("open");
      });

      detailDrawer.addEventListener("click", (event) => {
        if (event.target === detailDrawer) {
          detailDrawer.classList.remove("open");
        }
      });

      refreshFlow().catch((error) => {
        resultView.textContent = String(error);
        resultStatus.textContent = "error";
      });
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

  sendError(response, 404, new Error("route not found"));
});

server.listen(port, host, () => {
  console.log(`Polana core client listening on http://${host}:${port}`);
});
