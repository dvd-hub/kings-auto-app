"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { isIP } from "node:net";
import { storeGeneratedDocument } from "@/lib/documents";
import { signaturePng } from "@/lib/signature";
import { freezePdf } from "@/lib/pdf/estimate-data";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { estimateEditable, orderError, orderEvent, type OrderResult } from "@/lib/orders";
import { fieldErrors, estimateCreateSchema, estimateDetailsSchema, estimateSendSchema, estimateLineSchema, estimateCommandSchema, lineCommandSchema, authorizationSchema, freezePdfSchema, estimateEmailSchema, estimateLinkRevokeSchema } from "@/lib/validation";

async function context(orderId: string, estimateId: string) {
  if (!z.uuid().safeParse(orderId).success || !z.uuid().safeParse(estimateId).success) return null;
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return null;
  const [{ data: order }, { data: estimate }] = await Promise.all([
    supabase.from("repair_orders").select("*").eq("id", orderId).is("deleted_at", null).maybeSingle(),
    supabase.from("estimates").select("*").eq("id", estimateId).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle(),
  ]);
  return order && estimate ? { supabase, order, estimate } : null;
}

function refresh(orderId: string, estimateId: string, customerId: string) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/edit`);
  revalidatePath(`/orders/${orderId}/estimates/${estimateId}`);
  revalidatePath(`/customers/${customerId}`);
}

export async function createEstimate(input: unknown): Promise<OrderResult> {
  const parsed = estimateCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some(issue => issue.message === "supplementParentInvalid") ? "supplementParentInvalid" : "notFound" };
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const { data: order } = await supabase.from("repair_orders").select("id,status,customer_id").eq("id", parsed.data.orderId).is("deleted_at", null).maybeSingle();
  if (!order) return { ok: false, error: "notFound" };
  if (["cancelled", "delivered", "total_loss"].includes(order.status)) return { ok: false, error: "orderClosed" };
  // BEFORE INSERT estimates_seq assigns seq; omit it despite the generated Insert type.
  let parent: { id: string; payor_name: string | null; payor_claim_number: string | null } | null = null;
  if (parsed.data.kind === "supplement") {
    const { data, error } = await supabase.from("estimates").select("id,payor_name,payor_claim_number").eq("id", parsed.data.parentEstimateId!).eq("repair_order_id", order.id).in("kind", ["repair", "supplement"]).eq("status", "authorized").is("deleted_at", null).maybeSingle();
    if (error || !data) return { ok: false, error: "supplementParentInvalid" };
    parent = data;
  }
  const payload = { repair_order_id: order.id, kind: parsed.data.kind, ...(parent ? { parent_estimate_id: parent.id, payor_name: parent.payor_name, payor_claim_number: parent.payor_claim_number, basis: "shop" } : {}) } as Database["public"]["Tables"]["estimates"]["Insert"];
  const { data, error } = await supabase.from("estimates").insert(payload).select("id").single();
  if (error || !data) return { ok: false, error: orderError(error) };
  if (parent) await supabase.from("activities").insert({ repair_order_id: order.id, customer_id: order.customer_id, kind: "system", body: orderEvent("supplementCreatedActivity", {}) });
  refresh(order.id, data.id, order.customer_id);
  redirect(`/orders/${order.id}/estimates/${data.id}`);
}

export async function saveEstimateDetails(orderId: string, estimateId: string, input: unknown): Promise<OrderResult> {
  const ctx = await context(orderId, estimateId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (!estimateEditable(ctx.estimate)) return { ok: false, error: "estimateLocked" };
  const raw = typeof input === "object" && input !== null ? input : {};
  const parsed = (ctx.estimate.status === "sent" ? estimateSendSchema : estimateDetailsSchema).safeParse({ ...raw, kind: ctx.estimate.kind });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  if (ctx.estimate.status === "sent" && parsed.data.basis === "third_party" && !ctx.estimate.payor_estimate_document_id) return { ok: false, error: "payorDocumentRequired" };
  const { kind: _kind, ...values } = parsed.data; void _kind;
  const { data, error } = await ctx.supabase.from("estimates").update(values).eq("id", estimateId).eq("repair_order_id", orderId).is("deleted_at", null).is("locked_at", null).eq("status", ctx.estimate.status).eq("updated_at", ctx.estimate.updated_at).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
  refresh(orderId, estimateId, ctx.order.customer_id);
  return { ok: true, id: estimateId };
}

export async function saveEstimateLine(orderId: string, estimateId: string, lineId: string | null, input: unknown): Promise<OrderResult> {
  if (lineId && !z.uuid().safeParse(lineId).success) return { ok: false, error: "notFound" };
  const ctx = await context(orderId, estimateId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (!estimateEditable(ctx.estimate)) return { ok: false, error: "estimateLocked" };
  const raw = typeof input === "object" && input !== null ? input : {};
  const parsed = estimateLineSchema.safeParse({ ...raw, kind: ctx.estimate.kind });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.line_type === "hazardous_waste") {
    const { data: shop } = await ctx.supabase.from("shops").select("epa_id_number").eq("id", ctx.order.shop_id).is("deleted_at", null).maybeSingle();
    if (!shop?.epa_id_number?.trim()) return { ok: false, error: "epaRequired" };
  }
  let result;
  if (lineId) {
    result = await ctx.supabase.from("estimate_lines").update(parsed.data).eq("id", lineId).eq("estimate_id", estimateId).is("deleted_at", null).select("id").maybeSingle();
  } else {
    const { data: last, error: lastError } = await ctx.supabase.from("estimate_lines").select("position").eq("estimate_id", estimateId).is("deleted_at", null).order("position", { ascending: false }).limit(1);
    if (lastError) return { ok: false, error: orderError(lastError) };
    result = await ctx.supabase.from("estimate_lines").insert({ ...parsed.data, estimate_id: estimateId, position: (last?.[0]?.position ?? -1) + 1 }).select("id").single();
  }
  if (result.error || !result.data) return { ok: false, error: result.error ? orderError(result.error) : "notFound" };
  refresh(orderId, estimateId, ctx.order.customer_id);
  return { ok: true, id: result.data.id };
}

export async function changeEstimateLine(input: unknown): Promise<OrderResult> {
  const parsed = lineCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const { orderId, estimateId, lineId, command } = parsed.data;
  const ctx = await context(orderId, estimateId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (!estimateEditable(ctx.estimate)) return { ok: false, error: "estimateLocked" };
  const { data: lines, error: loadError } = await ctx.supabase.from("estimate_lines").select("id,position").eq("estimate_id", estimateId).is("deleted_at", null).order("position").order("id");
  if (loadError || !lines) return { ok: false, error: "load" };
  const index = lines.findIndex((line) => line.id === lineId);
  if (index < 0) return { ok: false, error: "notFound" };
  const current = lines[index];
  if (command === "remove") {
    const { data, error } = await ctx.supabase.from("estimate_lines").update({ deleted_at: new Date().toISOString() }).eq("id", lineId).eq("estimate_id", estimateId).is("deleted_at", null).select("id").maybeSingle();
    if (error || !data) return { ok: false, error: error ? orderError(error) : "notFound" };
  } else {
    const other = lines[index + (command === "up" ? -1 : 1)];
    if (!other) return { ok: true, id: lineId };
    if (other.position === current.position) return { ok: false, error: "linePositionConflict" };
    const { data: moved, error } = await ctx.supabase.from("estimate_lines").update({ position: other.position }).eq("id", current.id).eq("estimate_id", estimateId).eq("position", current.position).is("deleted_at", null).select("id").maybeSingle();
    if (error || !moved) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
    const { data: swapped, error: swapError } = await ctx.supabase.from("estimate_lines").update({ position: current.position }).eq("id", other.id).eq("estimate_id", estimateId).eq("position", other.position).is("deleted_at", null).select("id").maybeSingle();
    if (swapError || !swapped) {
      const { error: rollbackError } = await ctx.supabase.from("estimate_lines").update({ position: current.position }).eq("id", current.id).eq("estimate_id", estimateId).eq("position", other.position).is("deleted_at", null);
      refresh(orderId, estimateId, ctx.order.customer_id);
      return { ok: false, error: rollbackError ? "linePositionConflict" : swapError ? orderError(swapError) : "changedElsewhere" };
    }
  }
  refresh(orderId, estimateId, ctx.order.customer_id);
  return { ok: true, id: lineId };
}

export async function changeEstimateStatus(input: unknown, details?: unknown): Promise<OrderResult> {
  const parsed = estimateCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const { orderId, estimateId, command } = parsed.data;
  const ctx = await context(orderId, estimateId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (!estimateEditable(ctx.estimate)) return { ok: false, error: "estimateLocked" };
  if ((command === "sent" && ctx.estimate.status !== "draft") || (command === "draft" && ctx.estimate.status !== "sent")) return { ok: false, error: "changedElsewhere" };
  let fields: Database["public"]["Tables"]["estimates"]["Update"] = {};
  if (command === "sent") {
    const raw = typeof details === "object" && details !== null ? details : {};
    const valid = estimateSendSchema.safeParse({ ...raw, kind: ctx.estimate.kind });
    if (!valid.success) return { ok: false, fieldErrors: fieldErrors(valid.error) };
    if (valid.data.basis === "third_party" && !ctx.estimate.payor_estimate_document_id) return { ok: false, error: "payorDocumentRequired" };
    const { kind: _kind, ...values } = valid.data; void _kind; fields = values;
    const { data: lines, error } = await ctx.supabase.from("estimate_lines").select("id,teardown_role").eq("estimate_id", estimateId).is("deleted_at", null);
    if (error) return { ok: false, error: "load" };
    if (!lines?.length) return { ok: false, error: "estimateNeedsLines" };
    if (ctx.estimate.kind === "teardown" && (!lines.some((l) => l.teardown_role === "teardown") || !lines.some((l) => l.teardown_role === "reassembly"))) return { ok: false, error: "teardownNeedsLines" };
  }
  const { data, error } = await ctx.supabase.from("estimates").update({ ...fields, status: command, ...(command === "sent" ? { sent_at: new Date().toISOString() } : command === "draft" ? { sent_at: null } : {}) }).eq("id", estimateId).eq("repair_order_id", orderId).is("deleted_at", null).is("locked_at", null).eq("status", ctx.estimate.status).eq("updated_at", ctx.estimate.updated_at).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
  const { error: activityError } = await ctx.supabase.from("activities").insert({ repair_order_id: orderId, customer_id: ctx.order.customer_id, kind: "system", body: orderEvent(command === "sent" ? "sentActivity" : command === "draft" ? "draftActivity" : "voidActivity", { kind: ctx.estimate.kind, seq: ctx.estimate.seq }) });
  refresh(orderId, estimateId, ctx.order.customer_id);
  return { ok: true, id: estimateId, ...(activityError ? { warning: "historySave" } : {}) };
}

export async function sendEstimateByEmail(input: unknown, details?: unknown): Promise<OrderResult> {
  const parsed = estimateEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { orderId, estimateId, email } = parsed.data;
  const ctx = await context(orderId, estimateId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (!estimateEditable(ctx.estimate)) return { ok: false, error: "estimateLocked" };
  if (ctx.estimate.status === "draft") {
    const sent = await changeEstimateStatus({ orderId, estimateId, command: "sent" }, details);
    if (!sent.ok) return sent;
  }
  // Invoke with the normal server client: the Edge Function checks the user's JWT and RLS.
  try {
    const { data, error } = await ctx.supabase.functions.invoke("send-estimate-link", { body: { estimateId, email } });
    let response: unknown = data;
    if (error instanceof FunctionsHttpError) {
      try { response = await error.context.json(); } catch { response = null; }
    }
    const body = z.object({ ok: z.boolean().optional(), linkId: z.uuid().optional(), error: z.string().optional() }).safeParse(response);
    refresh(orderId, estimateId, ctx.order.customer_id);
    if (error || !body.success || !body.data.ok || !body.data.linkId) {
      const errors: Record<string, string> = { estimateNotSent: "estimateNotSent", emailFailed: "estimateEmailFailed", linkFailed: "estimateLinkFailed", notConfigured: "estimateEmailNotConfigured", notFound: "notFound", auth: "estimateEmailAuth", invalid: "estimateEmailInvalid" };
      return { ok: false, error: errors[body.success ? body.data.error ?? "" : ""] ?? "estimateEmailFailed" };
    }
    return { ok: true, id: body.data.linkId };
  } catch {
    refresh(orderId, estimateId, ctx.order.customer_id);
    return { ok: false, error: "estimateEmailFailed" };
  }
}

export async function revokeEstimateLink(input: unknown): Promise<OrderResult> {
  const parsed = estimateLinkRevokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const { orderId, estimateId, linkId } = parsed.data;
  const ctx = await context(orderId, estimateId);
  if (!ctx) return { ok: false, error: "notFound" };
  const { data, error } = await ctx.supabase.from("estimate_links").update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId).eq("estimate_id", estimateId).is("deleted_at", null).is("used_at", null).is("revoked_at", null).select("id").maybeSingle();
  refresh(orderId, estimateId, ctx.order.customer_id);
  if (error || !data) return { ok: false, error: error ? "estimateLinkFailed" : "changedElsewhere" };
  return { ok: true, id: data.id };
}

export async function authorizeEstimate(input: unknown): Promise<OrderResult> {
  const parsed = authorizationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const ctx = await context(v.orderId, v.estimateId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (v.by_designee) {
    if (ctx.estimate.kind !== "supplement" || !ctx.order.designee_signed_at || !ctx.order.designee_signature_document_id || !ctx.order.designee_name) return { ok: false, error: "designeeNotAllowed" };
    if (new Date(v.authorized_at) < new Date(ctx.order.designee_signed_at)) return { ok: false, error: "designeeNotAllowed" };
    v.authorizer_name = ctx.order.designee_name;
    v.phone_called = ctx.order.designee_phone;
    v.contact_phone = ctx.order.designee_phone;
    v.contact_email = ctx.order.designee_email;
  }
  if (ctx.estimate.status !== "sent" || !estimateEditable(ctx.estimate)) return { ok: false, error: "estimateLocked" };
  let signature_document_id: string | null = null;
  let signer_ip: string | null = null, signer_user_agent: string | null = null;
  if (v.method === "written") {
    const bytes = signaturePng(v.signature ?? "");
    if (!bytes) return { ok: false, fieldErrors: { signature: "signatureRequired" } };
    try {
      signature_document_id = (await storeGeneratedDocument(ctx.supabase, { shopId: ctx.order.shop_id, orderId: ctx.order.id, estimateId: ctx.estimate.id, kind: "signature", bytes, caption: v.authorizer_name })).id;
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "documentUpload" }; }
    const h = await headers();
    const ip = (h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0])?.trim();
    signer_ip = ip && isIP(ip) ? ip : null;
    signer_user_agent = h.get("user-agent")?.slice(0, 1000) ?? null;
  }
  // The trigger calculates amount_cents and content_sha256. Never send either.
  const payload = {
    estimate_id: ctx.estimate.id, method: v.method, decision: v.decision,
    authorized_at: v.authorized_at, authorizer_name: v.authorizer_name, by_designee: v.by_designee,
    phone_called: v.method === "oral" ? v.phone_called : null,
    contact_email: v.method === "electronic" ? v.contact_email : null,
    contact_phone: v.method === "electronic" ? v.contact_phone : null,
    ...(v.method === "written" ? { signature_document_id, signer_ip, signer_user_agent } : {}),
    return_parts_requested: v.decision === "approved" && v.return_parts_requested,
  } as Database["public"]["Tables"]["authorizations"]["Insert"];
  const { data, error } = await ctx.supabase.from("authorizations").insert(payload).select("id").single();
  if (error || !data) return { ok: false, error: orderError(error) };
  let warning: string | undefined;
  try { await freezePdf(ctx.supabase, ctx.order.id, ctx.estimate.id); } catch { warning = "pdfPending"; }
  const { error: activityError } = await ctx.supabase.from("activities").insert({ repair_order_id: ctx.order.id, customer_id: ctx.order.customer_id, kind: "system", body: orderEvent("authorizationActivity", { kind: ctx.estimate.kind, seq: ctx.estimate.seq, decision: v.decision, name: v.authorizer_name, method: v.method }) });
  if (activityError && !warning) warning = "historySave";
  refresh(ctx.order.id, ctx.estimate.id, ctx.order.customer_id);
  return { ok: true, id: data.id, ...(warning ? { warning } : {}) };
}

export async function freezeEstimatePdf(input: unknown): Promise<OrderResult> {
  const parsed = freezePdfSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await context(parsed.data.orderId, parsed.data.estimateId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (!ctx.estimate.locked_at || !["authorized", "declined"].includes(ctx.estimate.status)) return { ok: false, error: "authorizationRequired" };
  try {
    const id = await freezePdf(ctx.supabase, ctx.order.id, ctx.estimate.id);
    refresh(ctx.order.id, ctx.estimate.id, ctx.order.customer_id);
    return { ok: true, id };
  } catch { return { ok: false, error: "pdfFailed" }; }
}
