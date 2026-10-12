import { z } from "zod";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { loadReceiptPdfData } from "@/lib/pdf/receipt-data";
import { renderReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { formatPaymentNumber } from "@/lib/format";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params;
  const t = await getT();
  const noCache = { "Cache-Control": "private, no-store" };
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(paymentId).success) return new Response(t("errors.notFound"), { status: 404, headers: noCache });
  try {
    const client = await createClient();
    if (!(await client.auth.getUser()).data.user) return new Response(t("errors.notFound"), { status: 401, headers: noCache });
    const data = await loadReceiptPdfData(client, id, paymentId);
    const pdf = await renderReceiptPdf(data);
    const filename = `${formatPaymentNumber(data.payment.payment_number)}.pdf`;
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(pdf), { headers: {
      ...noCache, "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    } });
  } catch (error) {
    const missing = error instanceof Error && error.message === "notFound";
    return new Response(t(missing ? "errors.notFound" : "errors.receiptPdfFailed"), { status: missing ? 404 : 500, headers: noCache });
  }
}
