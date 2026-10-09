import { createTranslator } from "next-intl";
import { getAppMessages } from "@/i18n/messages";
import { renderEstimatePdf } from "@/lib/pdf/estimate-pdf";
import { sha256 } from "@/lib/documents";
import { loadPublicEstimate, frozenPublicPdf, publicEstimateData, publicEstimateHeaders } from "../../link-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const locale = new URL(request.url).searchParams.get("lang") === "es" ? "es" : "en";
  const t = createTranslator({ locale, messages: await getAppMessages(locale) });
  try {
    const { token } = await params;
    const ctx = await loadPublicEstimate(token);
    if (ctx.error) return new Response(t(`remoteEstimate.errors.${ctx.error}`), { status: 404, headers: publicEstimateHeaders });
    let bytes: Buffer;
    if (ctx.link?.used_at) {
      const document = await frozenPublicPdf(ctx);
      if (!document) return new Response(t("remoteEstimate.pdfPending"), { status: 409, headers: publicEstimateHeaders });
      const { data, error } = await ctx.admin.storage.from("documents").download(document.storage_path);
      if (error || !data) throw new Error("unavailable");
      bytes = Buffer.from(await data.arrayBuffer());
      if (sha256(bytes) !== document.sha256) throw new Error("unavailable");
    } else {
      bytes = await renderEstimatePdf(await publicEstimateData(ctx), true);
    }
    return new Response(new Uint8Array(bytes), { headers: { ...publicEstimateHeaders, "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="estimate.pdf"' } });
  } catch {
    return new Response(t("remoteEstimate.errors.unavailable"), { status: 503, headers: publicEstimateHeaders });
  }
}
