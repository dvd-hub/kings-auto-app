import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { EstimatePdfData } from "./estimate-pdf";
import { sha256, storeGeneratedDocument } from "@/lib/documents";
import { renderEstimatePdf } from "./estimate-pdf";

type Client = Awaited<ReturnType<typeof createClient>>;
export async function loadEstimatePdfData(client: Client, orderId: string, estimateId: string): Promise<EstimatePdfData> {
  const [{ data: order, error: orderError }, { data: estimate, error: estimateError }] = await Promise.all([
    client.from("repair_orders").select("*,customers(*),vehicles(*)").eq("id", orderId).is("deleted_at", null).maybeSingle(),
    client.from("estimates").select("*").eq("id", estimateId).eq("repair_order_id", orderId).is("deleted_at", null).in("kind", ["teardown", "repair"]).maybeSingle(),
  ]);
  if (orderError || estimateError || !order?.customers || !order.vehicles || !estimate) throw new Error("notFound");
  const [shop, lines, totals, auth] = await Promise.all([
    client.from("shops").select("*").eq("id", order.shop_id).is("deleted_at", null).single(),
    client.from("estimate_lines").select("*").eq("estimate_id", estimateId).is("deleted_at", null).order("position").order("id"),
    client.from("estimate_totals").select("*").eq("estimate_id", estimateId).single(),
    client.from("authorizations").select("*").eq("estimate_id", estimateId).is("deleted_at", null).maybeSingle(),
  ]);
  if (shop.error || lines.error || totals.error || auth.error || !shop.data || !totals.data) throw new Error("load");
  let signature: Buffer | null = null;
  if (auth.data?.signature_document_id) {
    const { data: doc } = await client.from("documents").select("*").eq("id", auth.data.signature_document_id).eq("repair_order_id", orderId).eq("estimate_id", estimateId).eq("kind", "signature").is("deleted_at", null).single();
    if (!doc) throw new Error("documentRead");
    const { data: blob, error } = await client.storage.from("documents").download(doc.storage_path);
    if (error || !blob) throw new Error("documentRead");
    signature = Buffer.from(await blob.arrayBuffer());
    if (sha256(signature) !== doc.sha256) throw new Error("documentRead");
  }
  return { shop: shop.data, order, estimate, customer: order.customers, vehicle: order.vehicles, lines: lines.data ?? [], totals: totals.data, authorization: auth.data, signature };
}

export async function freezePdf(client: Client, orderId: string, estimateId: string) {
  const { data: existing } = await client.from("estimates").select("pdf_document_id,locked_at").eq("id", estimateId).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle();
  if (!existing?.locked_at) throw new Error("authorizationRequired");
  if (existing.pdf_document_id) return existing.pdf_document_id;
  const data = await loadEstimatePdfData(client, orderId, estimateId);
  if (!data.estimate.locked_at || !data.authorization) throw new Error("authorizationRequired");
  if (data.estimate.pdf_document_id) return data.estimate.pdf_document_id;
  const bytes = await renderEstimatePdf(data, false);
  const doc = await storeGeneratedDocument(client, { shopId: data.order.shop_id, orderId, estimateId, kind: "estimate_pdf", bytes, caption: `Estimate ${data.estimate.seq}` });
  const { data: saved, error } = await client.from("estimates").update({ pdf_document_id: doc.id, pdf_sha256: doc.sha256 }).eq("id", estimateId).eq("repair_order_id", orderId).is("deleted_at", null).is("pdf_document_id", null).not("locked_at", "is", null).select("pdf_document_id").maybeSingle();
  if (saved?.pdf_document_id) return saved.pdf_document_id;
  // Another request may have won the one-time assignment. Never overwrite its PDF.
  const { data: current } = await client.from("estimates").select("pdf_document_id").eq("id", estimateId).is("deleted_at", null).maybeSingle();
  if (current?.pdf_document_id) return current.pdf_document_id;
  throw new Error(error ? "pdfPending" : "changedElsewhere");
}
