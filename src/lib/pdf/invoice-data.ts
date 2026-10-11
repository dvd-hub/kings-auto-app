import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { InvoicePdfData } from "./invoice-pdf";
import { renderInvoicePdf } from "./invoice-pdf";
import { storeInvoicePdfDocument } from "@/lib/documents";
import { formatInvoiceNumber } from "@/lib/format";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadInvoicePdfData(client: Client, orderId: string, invoiceId: string): Promise<InvoicePdfData> {
  const [order, invoice, lines] = await Promise.all([
    client.from("repair_orders").select("*,customers(*),vehicles(*)").eq("id", orderId).is("deleted_at", null).maybeSingle(),
    client.from("invoices").select("*").eq("id", invoiceId).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle(),
    client.from("invoice_lines").select("*").eq("invoice_id", invoiceId).is("deleted_at", null).order("position").order("id"),
  ]);
  if (order.error || invoice.error || lines.error) throw new Error("load");
  if (!order.data?.customers || !order.data.vehicles || !invoice.data) throw new Error("notFound");
  const estimateIds = [...new Set((lines.data ?? []).map(line => line.estimate_id))];
  const [shop, estimates, auth] = await Promise.all([
    client.from("shops").select("*").eq("id", order.data.shop_id).is("deleted_at", null).single(),
    estimateIds.length ? client.from("estimates").select("*").in("id", estimateIds).eq("repair_order_id", orderId).is("deleted_at", null).order("seq") : Promise.resolve({ data: [], error: null }),
    estimateIds.length ? client.from("authorizations").select("*").in("estimate_id", estimateIds).eq("decision", "approved").is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
  ]);
  if (shop.error || estimates.error || auth.error || !shop.data || estimates.data?.length !== estimateIds.length) throw new Error("load");
  const authorizations = (estimates.data ?? []).map(estimate => {
    const authorization = auth.data?.find(row => row.estimate_id === estimate.id);
    if (!authorization) throw new Error("invoiceNoAuthorization");
    return { estimate, authorization };
  });
  return { shop: shop.data, order: order.data, invoice: invoice.data, customer: order.data.customers, vehicle: order.data.vehicles, lines: lines.data ?? [], authorizations };
}

export async function freezeInvoicePdfDocument(client: Client, orderId: string, invoiceId: string) {
  const { data: invoice, error: loadError } = await client.from("invoices").select("*").eq("id", invoiceId).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle();
  if (loadError || !invoice) throw new Error("notFound");
  if (invoice.pdf_document_id) return invoice.pdf_document_id;
  if (invoice.status !== "issued") throw new Error("invoiceNotIssued");
  const storagePath = `${invoice.shop_id}/ro/${orderId}/invoices/${invoiceId}.pdf`;
  const { data: existing, error: documentError } = await client.from("documents").select("id,sha256,mime_type,kind").eq("storage_path", storagePath).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle();
  if (documentError) throw new Error("documentRead");
  if (existing && (existing.kind !== "invoice_pdf" || existing.mime_type !== "application/pdf" || !existing.sha256)) throw new Error("documentRead");
  const doc = existing ?? await storeInvoicePdfDocument(client, {
    shopId: invoice.shop_id, orderId, invoiceId,
    bytes: await renderInvoicePdf(await loadInvoicePdfData(client, orderId, invoiceId)),
    caption: formatInvoiceNumber(invoice.invoice_number!),
  });
  const { error } = await client.rpc("freeze_invoice_pdf", { p_invoice: invoiceId, p_document: doc.id });
  // Another request can win the one-time freeze. Never replace its document.
  const { data: current } = await client.from("invoices").select("pdf_document_id").eq("id", invoiceId).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle();
  if (current?.pdf_document_id) return current.pdf_document_id;
  throw new Error(error ? "invoicePdfPending" : "changedElsewhere");
}
