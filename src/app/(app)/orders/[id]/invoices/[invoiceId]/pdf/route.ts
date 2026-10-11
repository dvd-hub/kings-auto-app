import { z } from "zod";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_URL_SECONDS, signedDocument } from "@/lib/documents";
import { loadInvoicePdfData } from "@/lib/pdf/invoice-data";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { formatInvoiceNumber } from "@/lib/format";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const { id, invoiceId } = await params;
  const t = await getT();
  const noCache = { "Cache-Control": "private, no-store" };
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(invoiceId).success) return new Response(t("errors.notFound"), { status: 404, headers: noCache });
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return new Response(t("errors.notFound"), { status: 401, headers: noCache });
  try {
    const [order, result] = await Promise.all([
      client.from("repair_orders").select("id").eq("id", id).is("deleted_at", null).maybeSingle(),
      client.from("invoices").select("*").eq("id", invoiceId).eq("repair_order_id", id).is("deleted_at", null).maybeSingle(),
    ]);
    if (order.error || result.error) throw new Error("load");
    const invoice = result.data;
    if (!order.data || !invoice) throw new Error("notFound");
    const download = new URL(request.url).searchParams.get("download") === "1";
    const filename = `${invoice.invoice_number === null ? "invoice-draft" : formatInvoiceNumber(invoice.invoice_number)}.pdf`;
    if (invoice.pdf_document_id) {
      const document = await signedDocument(client, invoice.pdf_document_id, id, "invoice_pdf");
      if (!document.url || !invoice.pdf_sha256 || document.sha256 !== invoice.pdf_sha256 || document.mime_type !== "application/pdf" || document.shop_id !== invoice.shop_id
        || document.storage_path !== `${invoice.shop_id}/ro/${id}/invoices/${invoiceId}.pdf`) throw new Error("documentRead");
      if (download) {
        const { data, error } = await client.storage.from("documents").createSignedUrl(document.storage_path, DOCUMENT_URL_SECONDS, { download: filename });
        if (error || !data?.signedUrl) throw new Error("documentRead");
        return new Response(null, { status: 302, headers: { ...noCache, Location: data.signedUrl } });
      }
      return new Response(null, { status: 302, headers: { ...noCache, Location: document.url } });
    }
    const pdf = await renderInvoicePdf(await loadInvoicePdfData(client, id, invoiceId));
    return new Response(new Uint8Array(pdf), { headers: { ...noCache, "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"` } });
  } catch (error) {
    const missing = error instanceof Error && error.message === "notFound";
    return new Response(t(missing ? "errors.notFound" : "errors.invoicePdfFailed"), { status: missing ? 404 : 500, headers: noCache });
  }
}
