import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEstimatePdfData } from "@/lib/pdf/estimate-data";
import { sha256 } from "@/lib/documents";
import { validDocumentPath } from "@/lib/documents";
import type { EstimatePdfData } from "@/lib/pdf/estimate-pdf";

export const publicEstimateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export type PublicLinkError = "invalid" | "expired" | "revoked" | "unavailable" | "notConfigured";

export async function loadPublicEstimate(token: string) {
  const admin = createAdminClient();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    const contact = await fallbackContact(admin);
    return { admin, error: "invalid" as PublicLinkError, phone: contact?.phone ?? null, contact };
  }
  const { data: link, error } = await admin.from("estimate_links").select("*").eq("token_hash", tokenHash).is("deleted_at", null).maybeSingle();
  if (error) return { admin, error: "unavailable" as PublicLinkError, phone: null, contact: null };
  if (!link) {
    const contact = await fallbackContact(admin);
    return { admin, error: "invalid" as PublicLinkError, phone: contact?.phone ?? null, contact };
  }
  const { data: shop } = await admin.from("shops").select("phone,name,legal_name,address_line1,address_line2,city,state,zip").eq("id", link.shop_id).is("deleted_at", null).maybeSingle();
  const phone = shop?.phone ?? null;
  const contact = shop;
  if (link.revoked_at) return { admin, error: "revoked" as PublicLinkError, phone, contact };
  if (new Date(link.expires_at).getTime() <= Date.now()) return { admin, error: "expired" as PublicLinkError, phone, contact };
  if (!link.sent_at || (link.used_at && !link.authorization_id)) return { admin, error: "unavailable" as PublicLinkError, phone, contact };
  const { data: estimate } = await admin.from("estimates").select("id,repair_order_id,status,locked_at,pdf_document_id")
    .eq("id", link.estimate_id).eq("shop_id", link.shop_id).is("deleted_at", null).maybeSingle();
  if (!estimate || (!link.used_at && (estimate.status !== "sent" || estimate.locked_at))) return { admin, error: "unavailable" as PublicLinkError, phone, contact };
  const { data: order } = await admin.from("repair_orders").select("id,customers(id,deleted_at,preferred_language),vehicles(id,deleted_at)")
    .eq("id", estimate.repair_order_id).eq("shop_id", link.shop_id).is("deleted_at", null).maybeSingle();
  if (!order?.customers || order.customers.deleted_at || !order.vehicles || order.vehicles.deleted_at) return { admin, error: "unavailable" as PublicLinkError, phone, contact };
  if (link.used_at) {
    const { data: authorization } = await admin.from("authorizations").select("decision")
      .eq("id", link.authorization_id!).eq("estimate_id", estimate.id).eq("shop_id", link.shop_id).is("deleted_at", null).maybeSingle();
    if (!authorization) return { admin, error: "unavailable" as PublicLinkError, phone, contact };
    return { admin, link, estimate, tokenHash, phone, contact, locale: order.customers.preferred_language, decision: authorization.decision };
  }
  return { admin, link, estimate, tokenHash, phone, contact, locale: order.customers.preferred_language, decision: null };
}

async function fallbackContact(admin: ReturnType<typeof createAdminClient>) {
  // A random token has no shop context. Only use a contact if exactly one shop exists.
  const { data } = await admin.from("shops").select("phone,name,legal_name,address_line1,address_line2,city,state,zip").is("deleted_at", null).limit(2);
  return data?.length === 1 ? data[0] : null;
}

export function reviewFingerprint(data: EstimatePdfData) {
  // Bind the form to what was displayed, including the lines and legal/shop details.
  return sha256(Buffer.from(JSON.stringify({ estimate: data.estimate, lines: data.lines, totals: data.totals,
    order: data.order, customer: data.customer, vehicle: data.vehicle, shop: data.shop, supplement: data.supplement })));
}

export async function frozenPublicPdf(ctx: Awaited<ReturnType<typeof loadPublicEstimate>>) {
  if (ctx.error || !ctx.link?.used_at || !ctx.estimate?.pdf_document_id) return null;
  const { data: document, error } = await ctx.admin.from("documents").select("*")
    .eq("id", ctx.estimate.pdf_document_id).eq("shop_id", ctx.link.shop_id).eq("estimate_id", ctx.estimate.id)
    .eq("repair_order_id", ctx.estimate.repair_order_id).eq("kind", "estimate_pdf").is("deleted_at", null).maybeSingle();
  if (error || !document?.sha256 || !validDocumentPath(document.storage_path, ctx.link.shop_id, ctx.estimate.repair_order_id, "third_party_estimate", ctx.estimate.id)) return null;
  return document;
}

export async function publicPdfDownload(ctx: Awaited<ReturnType<typeof loadPublicEstimate>>) {
  const document = await frozenPublicPdf(ctx);
  if (!document) return null;
  const { data, error } = await ctx.admin.storage.from("documents").createSignedUrl(document.storage_path, 600, { download: "signed-estimate.pdf" });
  return error ? null : data?.signedUrl ?? null;
}

export async function publicEstimateData(ctx: Awaited<ReturnType<typeof loadPublicEstimate>>) {
  if (ctx.error || !ctx.estimate) throw new Error("unavailable");
  return loadEstimatePdfData(ctx.admin, ctx.estimate.repair_order_id, ctx.estimate.id);
}
