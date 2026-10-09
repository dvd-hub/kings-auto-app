import { z } from "zod";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { signedDocument, DOCUMENT_URL_SECONDS } from "@/lib/documents";
import { loadEstimatePdfData } from "@/lib/pdf/estimate-data";
import { renderEstimatePdf } from "@/lib/pdf/estimate-pdf";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; estimateId: string }> }) {
  const { id, estimateId } = await params;
  const t = await getT();
  const noCache = { "Cache-Control": "private, no-store" };
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(estimateId).success) return new Response(t("errors.notFound"), { status: 404, headers: noCache });
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return new Response(t("errors.notFound"), { status: 401, headers: noCache });
  try {
    const [{ data: order }, { data: estimate }] = await Promise.all([
      client.from("repair_orders").select("id").eq("id", id).is("deleted_at", null).maybeSingle(),
      client.from("estimates").select("pdf_document_id,pdf_sha256,seq").eq("id", estimateId).eq("repair_order_id", id).is("deleted_at", null).in("kind", ["teardown", "repair"]).maybeSingle(),
    ]);
    if (!order || !estimate) throw new Error("notFound");
    if (estimate.pdf_document_id) {
      const document = await signedDocument(client, estimate.pdf_document_id, id, "estimate_pdf");
      if (!document.url || document.estimate_id !== estimateId) throw new Error("documentRead");
      if (document.sha256 !== estimate.pdf_sha256) throw new Error("documentRead");
      if (new URL(request.url).searchParams.get("download") === "1") {
        const { data: download, error } = await client.storage.from("documents").createSignedUrl(document.storage_path, DOCUMENT_URL_SECONDS, { download: `estimate-${estimate.seq}.pdf` });
        if (error || !download) throw new Error("documentRead");
        return new Response(null, { status: 302, headers: { ...noCache, Location: download.signedUrl } });
      }
      return new Response(null, { status: 302, headers: { ...noCache, Location: document.url } });
    }
    const data = await loadEstimatePdfData(client, id, estimateId);
    const pdf = await renderEstimatePdf(data, true);
    return new Response(new Uint8Array(pdf), { headers: { ...noCache, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="estimate-${data.estimate.seq}-preview.pdf"` } });
  } catch (error) {
    const missing = error instanceof Error && error.message === "notFound";
    return new Response(t(missing ? "errors.notFound" : "errors.pdfFailed"), { status: missing ? 404 : 500, headers: noCache });
  }
}
