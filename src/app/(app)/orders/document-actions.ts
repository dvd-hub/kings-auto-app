"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registerDocumentSchema, documentEditSchema, attachPayorSchema, fieldErrors } from "@/lib/validation";
import { estimateEditable, orderError, type OrderResult } from "@/lib/orders";
import { validDocumentPath, sha256 } from "@/lib/documents";
import { MAX_DOCUMENT_BYTES, DOCUMENT_MIMES } from "@/lib/document-shared";

export async function registerDocument(input: unknown): Promise<OrderResult> {
  const parsed = registerDocumentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "documentOrphan", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const { data: order } = await client.from("repair_orders").select("id,shop_id").eq("id", v.repair_order_id).is("deleted_at", null).maybeSingle();
  if (!order || !validDocumentPath(v.storage_path, order.shop_id, order.id, v.kind, v.estimate_id)) return { ok: false, error: "documentPath" };
  if (v.estimate_id) {
    const { data: estimate } = await client.from("estimates").select("*").eq("id", v.estimate_id).eq("repair_order_id", order.id).is("deleted_at", null).maybeSingle();
    if (!estimate) return { ok: false, error: "notFound" };
    if (!estimateEditable(estimate)) return { ok: false, error: "estimateLocked" };
  }
  const { data: object, error: downloadError } = await client.storage.from("documents").download(v.storage_path);
  if (downloadError || !object) return { ok: false, error: "documentOrphan" };
  const mime = object.type.toLowerCase().split(";")[0];
  if (!DOCUMENT_MIMES.some((m) => m === mime) || (v.kind === "photo" && !mime.startsWith("image/"))) return { ok: false, error: "documentMime" };
  if (!object.size || object.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "documentSize" };
  const bytes = Buffer.from(await object.arrayBuffer());
  const { data, error } = await client.from("documents").insert({ ...v, mime_type: mime, size_bytes: bytes.length, sha256: sha256(bytes) }).select("id").single();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "documentOrphan", ...(error?.code !== "23505" ? { warning: "documentOrphan" } : {}) };
  revalidatePath(`/orders/${order.id}`);
  if (v.estimate_id) revalidatePath(`/orders/${order.id}/estimates/${v.estimate_id}`);
  return { ok: true, id: data.id };
}

export async function editDocument(input: unknown): Promise<OrderResult> {
  const parsed = documentEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { orderId, documentId, caption, remove } = parsed.data;
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const { data: order } = await client.from("repair_orders").select("id").eq("id", orderId).is("deleted_at", null).maybeSingle();
  const { data: document } = await client.from("documents").select("*").eq("id", documentId).eq("repair_order_id", orderId).is("deleted_at", null).in("kind", ["photo", "third_party_estimate", "authorization_proof", "other"]).maybeSingle();
  if (!order || !document) return { ok: false, error: "notFound" };
  if (remove && document.estimate_id) {
    const { data: estimate } = await client.from("estimates").select("*").eq("id", document.estimate_id).is("deleted_at", null).maybeSingle();
    if (!estimate || !estimateEditable(estimate) || estimate.payor_estimate_document_id === document.id) return { ok: false, error: "documentProtected" };
  }
  const { data, error } = await client.from("documents").update(remove ? { deleted_at: new Date().toISOString() } : { caption: caption ?? null }).eq("id", documentId).eq("repair_order_id", orderId).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "notFound" };
  revalidatePath(`/orders/${orderId}`);
  if (document.estimate_id) revalidatePath(`/orders/${orderId}/estimates/${document.estimate_id}`);
  return { ok: true, id: documentId };
}

export async function attachPayorDocument(input: unknown): Promise<OrderResult> {
  const parsed = attachPayorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const { orderId, estimateId, documentId } = parsed.data;
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const [{ data: order }, { data: estimate }, { data: document }] = await Promise.all([
    client.from("repair_orders").select("id").eq("id", orderId).is("deleted_at", null).maybeSingle(),
    client.from("estimates").select("*").eq("id", estimateId).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle(),
    client.from("documents").select("id").eq("id", documentId).eq("repair_order_id", orderId).eq("estimate_id", estimateId).eq("kind", "third_party_estimate").is("deleted_at", null).maybeSingle(),
  ]);
  if (!order || !estimate || !document) return { ok: false, error: "notFound" };
  if (!estimateEditable(estimate)) return { ok: false, error: "estimateLocked" };
  const { data, error } = await client.from("estimates").update({ payor_estimate_document_id: documentId }).eq("id", estimateId).is("deleted_at", null).is("locked_at", null).eq("updated_at", estimate.updated_at).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
  revalidatePath(`/orders/${orderId}/estimates/${estimateId}`);
  return { ok: true, id: documentId };
}
