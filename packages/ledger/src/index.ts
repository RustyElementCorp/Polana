import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MemoryObject } from "@polana/memory-schema";

export interface LedgerEntry {
  memory_id: string;
  canonical_hash: string;
  content_cid: string;
  recorded_at: string;
  producer_id: string;
  policy_id?: string;
}

export interface LedgerRecord {
  entry: LedgerEntry;
  memory: MemoryObject;
}

export interface LedgerClient {
  append(record: LedgerRecord): Promise<LedgerEntry>;
  get(memoryId: string): Promise<LedgerRecord | null>;
  list(): Promise<LedgerRecord[]>;
}

export class JsonlLedgerClient implements LedgerClient {
  constructor(private readonly ledgerPath: string) {}

  async append(record: LedgerRecord): Promise<LedgerEntry> {
    await mkdir(dirname(this.ledgerPath), { recursive: true });
    await appendFile(this.ledgerPath, `${JSON.stringify(record)}\n`, "utf8");
    return record.entry;
  }

  async get(memoryId: string): Promise<LedgerRecord | null> {
    const records = await this.list();
    return records.find((record) => record.entry.memory_id === memoryId) ?? null;
  }

  async list(): Promise<LedgerRecord[]> {
    try {
      const data = await readFile(this.ledgerPath, "utf8");
      return data
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as LedgerRecord);
    } catch {
      return [];
    }
  }
}
