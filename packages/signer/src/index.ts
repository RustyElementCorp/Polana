import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";
import type { SignatureDescriptor } from "@polana/memory-schema";

export interface Ed25519KeyPairPem {
  algorithm: "ed25519";
  public_key_pem: string;
  private_key_pem: string;
  key_id: string;
}

function toBuffer(payload: string | Uint8Array): Buffer {
  return typeof payload === "string" ? Buffer.from(payload, "utf8") : Buffer.from(payload);
}

export function deriveKeyIdFromPublicKey(publicKeyPem: string): string {
  const digest = createHash("sha256").update(publicKeyPem, "utf8").digest("hex");
  return `key_${digest.slice(0, 32)}`;
}

export function generateEd25519KeyPairPem(): Ed25519KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: {
      format: "pem",
      type: "spki",
    },
    privateKeyEncoding: {
      format: "pem",
      type: "pkcs8",
    },
  });

  return {
    algorithm: "ed25519",
    public_key_pem: publicKey,
    private_key_pem: privateKey,
    key_id: deriveKeyIdFromPublicKey(publicKey),
  };
}

export function signPayloadEd25519(
  payload: string | Uint8Array,
  privateKeyPem: string,
  signer: string,
): SignatureDescriptor {
  const signature = signBytes(null, toBuffer(payload), privateKeyPem).toString("base64");
  return {
    algorithm: "ed25519",
    signer,
    value: signature,
  };
}

export function verifyPayloadEd25519(
  payload: string | Uint8Array,
  signature: SignatureDescriptor,
  publicKeyPem: string,
): boolean {
  if (signature.algorithm !== "ed25519") {
    return false;
  }

  try {
    return verifyBytes(
      null,
      toBuffer(payload),
      publicKeyPem,
      Buffer.from(signature.value, "base64"),
    );
  } catch {
    return false;
  }
}
