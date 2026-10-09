"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { storeGeneratedDocument } from "@/lib/documents";
import { signaturePng } from "@/lib/signature";
import { formatRoNumber } from "@/lib/format";
import { orderError, orderEvent, type OrderResult } from "@/lib/orders";
import { designeeSchema, teardownOutcomeSchema, orderCommandSchema, appointmentLinkSchema, payorNotificationSchema, fieldErrors } from "@/lib/validation";

async function context(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return null;
  const { data: order } = await supabase.from("repair_orders").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  return order ? { supabase, order } : null;
}

async function finish(ctx: NonNullable<Awaited<ReturnType<typeof context>>>, key: string, values: Record<string, string | number> = {}, kind: "system" | "status_change" = "system", appointmentId?: string): Promise<OrderResult> {
  const { error } = await ctx.supabase.from("activities").insert({ repair_order_id: ctx.order.id, customer_id: ctx.order.customer_id, ...(appointmentId ? { appointment_id: appointmentId } : {}), kind, body: orderEvent(key, values) });
  for (const path of ["/orders", `/orders/${ctx.order.id}`, `/orders/${ctx.order.id}/edit`, `/customers/${ctx.order.customer_id}`, "/calendar"]) revalidatePath(path);
  return { ok: true, id: ctx.order.id, ...(error ? { warning: "historySave" } : {}) };
}

export async function designatePerson(input: unknown): Promise<OrderResult> {
  const parsed = designeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data, ctx = await context(v.orderId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (ctx.order.designee_signed_at) return { ok: false, error: "designeeLocked" };
  const bytes = signaturePng(v.signature);
  if (!bytes) return { ok: false, fieldErrors: { signature: "signatureRequired" } };
  let documentId: string;
  try { documentId = (await storeGeneratedDocument(ctx.supabase, { shopId: ctx.order.shop_id, orderId: ctx.order.id, kind: "signature", bytes, caption: v.designee_name })).id; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "documentUpload" }; }
  const { data, error } = await ctx.supabase.from("repair_orders").update({ designee_name: v.designee_name, designee_phone: v.designee_phone, designee_email: v.designee_email, designee_signed_at: v.designee_signed_at, designee_signature_document_id: documentId }).eq("id", ctx.order.id).is("deleted_at", null).is("designee_signed_at", null).eq("updated_at", ctx.order.updated_at).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
  return finish(ctx, "designeeActivity", { name: v.designee_name });
}

export async function recordTeardownOutcome(input: unknown): Promise<OrderResult> {
  const parsed = teardownOutcomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "orderInvalid" };
  const ctx = await context(parsed.data.orderId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (ctx.order.teardown_outcome) return { ok: false, error: "teardownOutcomeFinal" };
  const { data: estimates, error: loadError } = await ctx.supabase.from("estimates").select("kind").eq("repair_order_id", ctx.order.id).eq("status", "authorized").is("deleted_at", null);
  if (loadError) return { ok: false, error: "load" };
  if (!estimates?.some(e => e.kind === "teardown")) return { ok: false, error: "teardownNotAuthorized" };
  if (parsed.data.outcome === "repair" && !estimates.some(e => e.kind === "repair")) return { ok: false, error: "repairNotAuthorized" };
  const { data, error } = await ctx.supabase.from("repair_orders").update({ teardown_outcome: parsed.data.outcome, teardown_outcome_at: new Date().toISOString() }).eq("id", ctx.order.id).is("deleted_at", null).is("teardown_outcome", null).eq("updated_at", ctx.order.updated_at).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
  return finish(ctx, "teardownActivity", { outcome: parsed.data.outcome });
}

export async function recordOrderCommand(input: unknown): Promise<OrderResult> {
  const parsed = orderCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "orderInvalid" };
  const ctx = await context(parsed.data.orderId);
  if (!ctx) return { ok: false, error: "notFound" };
  const loss = parsed.data.command === "total_loss";
  if (!(loss ? ["open", "in_progress"] : ["total_loss", "completed"]).includes(ctx.order.status)) return { ok: false, error: "orderClosed" };
  if (!loss && ctx.order.ready_for_pickup_notified_at) return { ok: true, id: ctx.order.id };
  const now = new Date().toISOString();
  let query = ctx.supabase.from("repair_orders").update(loss ? { status: "total_loss", total_loss_at: now } : { ready_for_pickup_notified_at: now }).eq("id", ctx.order.id).is("deleted_at", null).eq("status", ctx.order.status).eq("updated_at", ctx.order.updated_at);
  if (!loss) query = query.is("ready_for_pickup_notified_at", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
  return finish(ctx, loss ? "statusActivity" : "pickupNotifiedActivity", loss ? { ro: formatRoNumber(ctx.order.ro_number), status: "total_loss" } : {}, loss ? "status_change" : "system");
}

export async function notifyPayor(input: unknown): Promise<OrderResult> {
  const parsed = payorNotificationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await context(parsed.data.orderId);
  if (!ctx) return { ok: false, error: "notFound" };
  const { data: estimate } = await ctx.supabase.from("estimates").select("*").eq("id", parsed.data.estimateId).eq("repair_order_id", ctx.order.id).is("deleted_at", null).maybeSingle();
  if (!estimate || estimate.kind !== "supplement" || estimate.status !== "authorized" || !estimate.payor_name) return { ok: false, error: "notFound" };
  if (estimate.payor_notified_at) return { ok: true, id: estimate.id };
  const { data, error } = await ctx.supabase.from("estimates").update({ payor_notified_at: new Date().toISOString() }).eq("id", estimate.id).eq("repair_order_id", ctx.order.id).eq("status", "authorized").is("deleted_at", null).is("payor_notified_at", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
  revalidatePath(`/orders/${ctx.order.id}/estimates/${estimate.id}`);
  return finish(ctx, "payorNotifiedActivity", { seq: estimate.seq });
}

export async function linkAppointment(input: unknown): Promise<OrderResult> {
  const parsed = appointmentLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await context(parsed.data.orderId);
  if (!ctx) return { ok: false, error: "notFound" };
  const { data: appointment } = await ctx.supabase.from("appointments").select("*").eq("id", parsed.data.appointmentId).is("deleted_at", null).maybeSingle();
  if (!appointment) return { ok: false, error: "notFound" };
  if (appointment.customer_id !== ctx.order.customer_id) return { ok: false, error: "appointmentCustomerMismatch" };
  if (parsed.data.unlink ? appointment.repair_order_id !== ctx.order.id : appointment.repair_order_id !== null || appointment.status === "cancelled") return { ok: false, error: "changedElsewhere" };
  let query = ctx.supabase.from("appointments").update({ repair_order_id: parsed.data.unlink ? null : ctx.order.id }).eq("id", appointment.id).eq("customer_id", ctx.order.customer_id).eq("updated_at", appointment.updated_at).is("deleted_at", null);
  query = parsed.data.unlink ? query.eq("repair_order_id", ctx.order.id) : query.is("repair_order_id", null).neq("status", "cancelled");
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
  return finish(ctx, parsed.data.unlink ? "appointmentUnlinkedActivity" : "appointmentLinkedActivity", {}, "system", appointment.id);
}
