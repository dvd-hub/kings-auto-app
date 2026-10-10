"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { remoteAuthorizationSchema, fieldErrors } from "@/lib/validation";
import { signaturePng } from "@/lib/signature";
import { sha256 } from "@/lib/documents";
import { renderEstimatePdf } from "@/lib/pdf/estimate-pdf";
import { allowEstimateLinkRequest, requestIp } from "@/lib/estimate-link-rate-limit";
import { loadPublicEstimate, publicEstimateData, reviewFingerprint } from "./link-data";
import type { Database } from "@/lib/database.types";

export type RemoteResult = { ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string> };
const rpcErrors: Record<string, string> = {
  "link not found": "invalid", "link revoked": "revoked", "link already used": "alreadySigned",
  "link expired": "expired", "estimate is not open for signature": "unavailable", "approval needs a signature": "signatureRequired",
};

export async function signPublicEstimate(token: string, fingerprint: string, input: unknown): Promise<RemoteResult> {
  const parsed = remoteAuthorizationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const h = await headers();
  const ip = requestIp(h);
  if (!allowEstimateLinkRequest("sign-estimate", ip ?? "unknown", 10)) return { ok: false, error: "rateLimited" };
  let ctx;
  try { ctx = await loadPublicEstimate(token); } catch { return { ok: false, error: "notConfigured" }; }
  if (ctx.error) return { ok: false, error: ctx.error };
  if (!ctx.link || !ctx.estimate || !ctx.tokenHash) return { ok: false, error: "unavailable" };
  if (ctx.link.used_at) return { ok: false, error: "alreadySigned" };
  try {
    if (reviewFingerprint(await publicEstimateData(ctx)) !== fingerprint) return { ok: false, error: "changed" };
  } catch { return { ok: false, error: "unavailable" }; }
  const v = parsed.data;
  const bytes = v.signature ? signaturePng(v.signature) : null;
  if ((v.signature && !bytes) || (v.decision === "approved" && !bytes)) return { ok: false, fieldErrors: { signature: "signatureRequired" } };
  const path = bytes ? `${ctx.link.shop_id}/ro/${ctx.estimate.repair_order_id}/auth/${randomUUID()}.png` : null;
  if (path && bytes) {
    const { error } = await ctx.admin.storage.from("documents").upload(path, bytes, { contentType: "image/png", upsert: false });
    if (error) return { ok: false, error: "uploadFailed" };
  }
  // Generated RPC types don't describe nullable SQL arguments. Null is required for an unsigned rejection.
  const args = {
    p_token_hash: ctx.tokenHash, p_decision: v.decision, p_authorizer_name: v.authorizer_name,
    p_return_parts_requested: v.decision === "approved" && v.return_parts_requested,
    p_signature_path: path, p_signature_sha256: bytes ? sha256(bytes) : null, p_signature_size: bytes?.length ?? null,
    p_signer_ip: ip, p_signer_user_agent: h.get("user-agent")?.slice(0, 500) ?? null,
  } as Database["public"]["Functions"]["sign_estimate_via_link"]["Args"];
  const { error, data: authorizationId } = await ctx.admin.rpc("sign_estimate_via_link", args);
  if (error || !authorizationId) {
    if (path) {
      // Only remove this attempt's upload when the RPC did not register a document.
      const { data: registered, error: lookupError } = await ctx.admin.from("documents").select("id").eq("storage_path", path).maybeSingle();
      if (!lookupError && !registered) await ctx.admin.storage.from("documents").remove([path]);
    }
    return { ok: false, error: rpcErrors[error?.message ?? ""] ?? "saveFailed" };
  }
  // The decision is final even if PDF rendering/storage fails; the workshop can finish it later.
  try {
    const data = await publicEstimateData(ctx);
    const pdf = await renderEstimatePdf(data, false);
    const pdfPath = `${ctx.link.shop_id}/ro/${ctx.estimate.repair_order_id}/estimates/${ctx.estimate.id}/${randomUUID()}.pdf`;
    const { error: uploadError } = await ctx.admin.storage.from("documents").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
    if (!uploadError) await ctx.admin.rpc("freeze_estimate_pdf_via_link", { p_token_hash: ctx.tokenHash, p_storage_path: pdfPath, p_sha256: sha256(pdf), p_size: pdf.length });
  } catch { /* Keep the saved authorization. Never replace a frozen PDF. */ }
  try {
    await ctx.admin.functions.invoke("send-estimate-receipt", { body: { token }, timeout: 20_000 });
  } catch { /* Receipt failures must not change the saved authorization or expose the token. */ }
  revalidatePath(`/orders/${ctx.estimate.repair_order_id}`);
  revalidatePath(`/orders/${ctx.estimate.repair_order_id}/estimates/${ctx.estimate.id}`);
  return { ok: true };
}
