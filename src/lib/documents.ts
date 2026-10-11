import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import { MAX_DOCUMENT_BYTES, DOCUMENT_MIMES, documentExtensions, type OrderDocument, type SignedDocument } from "@/lib/document-shared";
import { orderError } from "@/lib/orders";

type Client = Awaited<ReturnType<typeof createClient>>;
export const DOCUMENT_URL_SECONDS = 600;
export function sha256(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }

export function validDocumentPath(path: string, shopId: string, orderId: string, kind: string, estimateId?: string) {
  const folder = kind === "photo" ? "photos" : kind === "third_party_estimate" ? `estimates/${estimateId}` : "auth";
  const prefix = `${shopId}/ro/${orderId}/`;
  if (!path.startsWith(prefix)) return false;
  const relative = path.slice(prefix.length);
  const file = relative.slice(relative.lastIndexOf("/") + 1);
  return relative === `${folder}/${file}` && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic|pdf)$/i.test(file);
}

export async function signedDocuments(client: Client, documents: OrderDocument[]): Promise<SignedDocument[]> {
  if (!documents.length) return [];
  const { data, error } = await client.storage.from("documents").createSignedUrls(documents.map((d) => d.storage_path), DOCUMENT_URL_SECONDS);
  if (error) throw new Error("documentRead");
  return documents.map((d, index) => ({ ...d, url: data?.[index]?.signedUrl || null }));
}

export async function signedDocument(client: Client, id: string, orderId: string, kind?: OrderDocument["kind"]) {
  let query = client.from("documents").select("*").eq("id", id).eq("repair_order_id", orderId).is("deleted_at", null);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("documentRead");
  return (await signedDocuments(client, [data]))[0];
}

export async function storeGeneratedDocument(client: Client, input: { shopId: string; orderId: string; estimateId?: string; kind: "signature" | "estimate_pdf"; bytes: Buffer; caption: string }) {
  if (input.kind === "estimate_pdf" && !input.estimateId) throw new Error("notFound");
  const mime = input.kind === "signature" ? "image/png" : "application/pdf";
  if (!input.bytes.length || input.bytes.length > MAX_DOCUMENT_BYTES || !DOCUMENT_MIMES.includes(mime)) throw new Error("documentSize");
  const storage_path = `${input.shopId}/ro/${input.orderId}/${input.kind === "signature" ? "auth" : `estimates/${input.estimateId}`}/${randomUUID()}.${documentExtensions[mime]}`;
  const { error: uploadError } = await client.storage.from("documents").upload(storage_path, input.bytes, { contentType: mime, upsert: false });
  if (uploadError) throw new Error("documentUpload");
  const hash = sha256(input.bytes);
  const { data, error } = await client.from("documents").insert({ storage_path, kind: input.kind, repair_order_id: input.orderId, ...(input.estimateId ? { estimate_id: input.estimateId } : {}), mime_type: mime, size_bytes: input.bytes.length, sha256: hash, caption: input.caption }).select("id,sha256").single();
  if (error || !data) throw new Error(error ? orderError(error) : "documentOrphan");
  return data;
}

export async function storeInvoicePdfDocument(client: Client, input: { shopId: string; orderId: string; invoiceId: string; bytes: Buffer; caption: string }) {
  const storage_path = `${input.shopId}/ro/${input.orderId}/invoices/${input.invoiceId}.pdf`;
  let bytes = input.bytes;
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error("documentSize");
  const { error: uploadError } = await client.storage.from("documents").upload(storage_path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    // A previous attempt may have uploaded the immutable file before its document insert failed.
    const { data: blob, error } = await client.storage.from("documents").download(storage_path);
    if (error || !blob) throw new Error("documentUpload");
    bytes = Buffer.from(await blob.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES || bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("documentRead");
  }
  const hash = sha256(bytes);
  const { data, error } = await client.from("documents").insert({
    storage_path, kind: "invoice_pdf", repair_order_id: input.orderId, mime_type: "application/pdf",
    size_bytes: bytes.length, sha256: hash, caption: input.caption,
  }).select("id,sha256").single();
  if (data && !error) return data;
  // Concurrent retries can register the same path; reuse only the matching document.
  const { data: existing } = await client.from("documents").select("id,sha256").eq("storage_path", storage_path)
    .eq("repair_order_id", input.orderId).eq("kind", "invoice_pdf").eq("mime_type", "application/pdf").eq("sha256", hash).is("deleted_at", null).maybeSingle();
  if (existing) return existing;
  throw new Error(error ? orderError(error) : "documentOrphan");
}
