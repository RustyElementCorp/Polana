import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  importRecordedBindingBundle,
  importRecordedMemoryBundle,
  listRecordedBindingObjects,
  listRecordedMemoryObjects,
  verifyRecordedMemoryObject,
} from "@polana/sdk";
import { LocalStorageClient } from "@polana/storage-client";

const baseDir = resolve(process.cwd(), ".polana");
const storageDir = join(baseDir, "storage");
const ledgerPath = join(baseDir, "ledger", "records.jsonl");
const bindingLedgerPath = join(baseDir, "ledger", "bindings.jsonl");
const lastIdPath = join(baseDir, "last-memory-id.txt");
const lastBindingIdPath = join(baseDir, "last-binding-id.txt");
const signingKeyPath = join(baseDir, "keys", "demo-ed25519.json");

function getClients() {
  return {
    storage: new LocalStorageClient(storageDir),
    ledger: new JsonlLedgerClient(ledgerPath),
    bindingLedger: new JsonlBindingLedgerClient(bindingLedgerPath),
  };
}

async function persistLastMemoryId(memoryId: string): Promise<void> {
  await mkdir(dirname(lastIdPath), { recursive: true });
  await writeFile(lastIdPath, `${memoryId}\n`, "utf8");
}

async function persistLastBindingId(bindingId: string): Promise<void> {
  await mkdir(dirname(lastBindingIdPath), { recursive: true });
  await writeFile(lastBindingIdPath, `${bindingId}\n`, "utf8");
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

async function createDemo(): Promise<void> {
  const { storage, ledger } = getClients();
  const signer = await loadOrCreateSigningKey();
  const entry = await createAndRecordMemoryObject(
    {
      content_body: JSON.stringify(
        {
          response: "Polana records AI outputs as verifiable memory objects.",
          summary: "Lightweight core demo artifact",
        },
        null,
        2,
      ),
      provenance: {
        model_name: "demo-model",
        model_version: "v0",
        provider: "polana-local",
        output_schema_version: "1.0.0",
      },
      producer: {
        producer_type: "agent",
        display_name: "Polana Demo CLI",
      },
      signer: {
        algorithm: "ed25519",
        private_key_pem: signer.private_key_pem,
        public_key_pem: signer.public_key_pem,
        signer: signer.key_id,
      },
      ownership: {
        owner_type: "organization",
        transferable: false,
      },
      timestamps: {
        created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        source_clock: "app",
      },
      policy: {
        policy_id: "default-public-v1",
        visibility: "public",
        retention: "permanent",
      },
      tags: ["demo", "ai-response", "memory"],
    },
    storage,
    ledger,
  );

  await persistLastMemoryId(entry.memory_id);
  console.log(JSON.stringify(entry, null, 2));
}

async function createBindingDemo(): Promise<void> {
  const { storage, bindingLedger } = getClients();
  const entry = await createAndRecordBindingObject(
    {
      subject_id: "prod_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      subject_type: "producer",
      external_ref: {
        network: "solana",
        address: "7abcfixture111111111111111111111111111111111",
        scheme: "solana-ed25519-v1",
      },
      verification: {
        status: "claimed",
        method: "demo-cli",
      },
      timestamps: {
        created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      },
      notes: "demo binding",
    },
    storage,
    bindingLedger,
  );

  await persistLastBindingId(entry.binding_id);
  console.log(JSON.stringify(entry, null, 2));
}

async function verify(memoryId?: string): Promise<void> {
  const { storage, ledger } = getClients();
  const effectiveMemoryId = memoryId ?? (await readFile(lastIdPath, "utf8")).trim();
  const result = await verifyRecordedMemoryObject(effectiveMemoryId, storage, ledger);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

async function listMemories(): Promise<void> {
  const { ledger } = getClients();
  console.log(JSON.stringify(await listRecordedMemoryObjects(ledger), null, 2));
}

async function exportMemory(memoryId?: string, outputPath?: string): Promise<void> {
  const { storage, ledger } = getClients();
  const effectiveMemoryId = memoryId ?? (await readFile(lastIdPath, "utf8")).trim();
  const bundle = await exportRecordedMemoryObject(effectiveMemoryId, storage, ledger);
  if (outputPath) {
    const resolved = resolve(outputPath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(bundle, null, 2));
}

async function importMemory(bundlePath: string): Promise<void> {
  const { storage, ledger } = getClients();
  const raw = await readFile(resolve(bundlePath), "utf8");
  const entry = await importRecordedMemoryBundle(JSON.parse(raw), storage, ledger);
  await persistLastMemoryId(entry.memory_id);
  console.log(JSON.stringify(entry, null, 2));
}

async function listBindings(): Promise<void> {
  const { bindingLedger } = getClients();
  console.log(JSON.stringify(await listRecordedBindingObjects(bindingLedger), null, 2));
}

async function exportBinding(bindingId?: string, outputPath?: string): Promise<void> {
  const { storage, bindingLedger } = getClients();
  const effectiveBindingId = bindingId ?? (await readFile(lastBindingIdPath, "utf8")).trim();
  const bundle = await exportRecordedBindingObject(effectiveBindingId, storage, bindingLedger);
  if (outputPath) {
    const resolved = resolve(outputPath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(bundle, null, 2));
}

async function importBinding(bundlePath: string): Promise<void> {
  const { storage, bindingLedger } = getClients();
  const raw = await readFile(resolve(bundlePath), "utf8");
  const entry = await importRecordedBindingBundle(JSON.parse(raw), storage, bindingLedger);
  await persistLastBindingId(entry.binding_id);
  console.log(JSON.stringify(entry, null, 2));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "create-demo") {
    await createDemo();
    return;
  }

  if (command === "create-binding-demo") {
    await createBindingDemo();
    return;
  }

  if (command === "verify") {
    await verify(process.argv[3]);
    return;
  }

  if (command === "list-memories") {
    await listMemories();
    return;
  }

  if (command === "export-memory") {
    await exportMemory(process.argv[3], process.argv[4]);
    return;
  }

  if (command === "import-memory") {
    if (!process.argv[3]) {
      throw new Error("bundle path is required");
    }
    await importMemory(process.argv[3]);
    return;
  }

  if (command === "list-bindings") {
    await listBindings();
    return;
  }

  if (command === "export-binding") {
    await exportBinding(process.argv[3], process.argv[4]);
    return;
  }

  if (command === "import-binding") {
    if (!process.argv[3]) {
      throw new Error("bundle path is required");
    }
    await importBinding(process.argv[3]);
    return;
  }

  console.error(
    "Usage: demo-cli <create-demo|create-binding-demo|verify [memory_id]|list-memories|export-memory [memory_id] [output_path]|import-memory <bundle_path>|list-bindings|export-binding [binding_id] [output_path]|import-binding <bundle_path>>",
  );
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
