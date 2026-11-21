import type { JSONContent } from "@tiptap/core";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

export interface SharedDocumentPayload {
  version: 1;
  title: string;
  document: JSONContent;
}

const MAX_ENCODED_LENGTH = 1_500_000;

export function encodeSharedDocument(document: JSONContent, title: string): string {
  const payload: SharedDocumentPayload = {
    version: 1,
    title: title || "公式文档",
    document
  };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeSharedDocument(encoded: string): SharedDocumentPayload | null {
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH) return null;
  try {
    const raw = decompressFromEncodedURIComponent(encoded);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<SharedDocumentPayload>;
    if (payload.version !== 1 || payload.document?.type !== "doc") return null;
    return {
      version: 1,
      title: typeof payload.title === "string" ? payload.title : "公式文档",
      document: payload.document
    };
  } catch {
    return null;
  }
}

export function parseSharedDocumentHash(hash: string): SharedDocumentPayload | null {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!value) return null;
  const params = new URLSearchParams(value);
  const encoded = params.get("doc");
  return encoded ? decodeSharedDocument(encoded) : null;
}

export function buildShareUrl(document: JSONContent, title: string): string {
  const encoded = encodeSharedDocument(document, title);
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#doc=${encoded}`;
}
