import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { JsonlLedgerClient } from "@polana/ledger";
import {
  type Ed25519KeyPairPem,
  generateEd25519KeyPairPem,
} from "@polana/signer";
import {
  createAndRecordMemoryObject,
  verifyRecordedMemoryObject,
} from "@polana/sdk";
import { LocalStorageClient } from "@polana/storage-client";

const baseDir = resolve(process.cwd(), ".polana");
const storageDir = join(baseDir, "storage");
const ledgerPath = join(baseDir, "ledger", "records.jsonl");
const lastIdPath = join(baseDir, "last-memory-id.txt");
const signingKeyPath = join(baseDir, "keys", "demo-ed25519.json");

function getClients() {
  return {
    storage: new LocalStorageClient(storageDir),
    ledger: new JsonlLedgerClient(ledgerPath),
  };
}

async function persistLastMemoryId(memoryId: string): Promise<void> {
  await mkdir(dirname(lastIdPath), { recursive: true });
  await writeFile(lastIdPath, `${memoryId}\n`, "utf8");
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
        producer_id: "agent:demo-cli",
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
        owner_id: "org:polana",
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

async function verify(memoryId?: string): Promise<void> {
  const { storage, ledger } = getClients();
  const effectiveMemoryId = memoryId ?? (await readFile(lastIdPath, "utf8")).trim();

  const result = await verifyRecordedMemoryObject(effectiveMemoryId, storage, ledger);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "create-demo") {
    await createDemo();
    return;
  }

  if (command === "verify") {
    await verify(process.argv[3]);
    return;
  }

  console.error("Usage: demo-cli <create-demo|verify [memory_id]>");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
