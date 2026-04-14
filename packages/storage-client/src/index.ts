import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface StoredObject {
  cid: string;
  bytes: number;
  path: string;
}

export interface StorageClient {
  put(data: string | Uint8Array): Promise<StoredObject>;
  get(cid: string): Promise<Uint8Array>;
  has(cid: string): Promise<boolean>;
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

function deriveLocalCid(bytes: Uint8Array): string {
  return `local_${createHash("sha256").update(bytes).digest("hex")}`;
}

export class LocalStorageClient implements StorageClient {
  constructor(private readonly rootDir: string) {}

  async put(data: string | Uint8Array): Promise<StoredObject> {
    const bytes = toBytes(data);
    const cid = deriveLocalCid(bytes);
    const path = this.pathForCid(cid);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return {
      cid,
      bytes: bytes.byteLength,
      path,
    };
  }

  async get(cid: string): Promise<Uint8Array> {
    const buffer = await readFile(this.pathForCid(cid));
    return new Uint8Array(buffer);
  }

  async has(cid: string): Promise<boolean> {
    try {
      const info = await stat(this.pathForCid(cid));
      return info.isFile();
    } catch {
      return false;
    }
  }

  private pathForCid(cid: string): string {
    const shard = cid.slice(0, 2);
    return join(this.rootDir, shard, `${cid}.json`);
  }
}
