import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { renderDesignationPdf } from "@/lib/pdf/designation-pdf";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, t = await getT();
  const headers = { "Cache-Control": "private, no-store" };
  if (!z.uuid().safeParse(id).success) return new Response(t("errors.notFound"), { status: 404, headers });
  const client = await createClient();
  if (!(await client.auth.getUser()).data.user) return new Response(t("errors.notFound"), { status: 401, headers });
  try {
    const pdf = await renderDesignationPdf(client, id);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="designation-${id}.pdf"` } });
  } catch (error) {
    const missing = error instanceof Error && error.message === "notFound";
    return new Response(t(missing ? "errors.notFound" : "errors.pdfFailed"), { status: missing ? 404 : 500, headers });
  }
}
