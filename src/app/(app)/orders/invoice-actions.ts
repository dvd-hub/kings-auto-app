"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { invoiceError } from "@/lib/invoices";
import type { OrderResult } from "@/lib/orders";
import { freezeInvoicePdfDocument } from "@/lib/pdf/invoice-data";
import { fieldErrors, invoiceCreateSchema, invoiceCommandSchema, invoiceLineCommandSchema, invoiceLineSchema, invoiceIssueSchema, invoiceVoidSchema } from "@/lib/validation";

async function context(orderId: string, invoiceId: string) {
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return null;
  const [order, invoice] = await Promise.all([
    supabase.from("repair_orders").select("id,odometer_in").eq("id", orderId).is("deleted_at", null).maybeSingle(),
    supabase.from("invoices").select("id,status").eq("id", invoiceId).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle(),
  ]);
  return order.data && invoice.data ? { supabase, order: order.data, invoice: invoice.data } : null;
}

function refresh(orderId: string) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/invoice`);
}

export async function createInvoiceDraft(input: unknown): Promise<OrderResult> {
  const parsed = invoiceCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const { data, error } = await supabase.rpc("create_invoice_draft", { p_repair_order: parsed.data.orderId });
  if (error || !data) return { ok: false, error: invoiceError(error) };
  refresh(parsed.data.orderId);
  redirect(`/orders/${parsed.data.orderId}/invoice`);
}

export async function saveInvoiceLine(input: unknown): Promise<OrderResult> {
  const parsed = invoiceLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { orderId, invoiceId, lineId, updatedAt, quantity, unit_price_cents, taxable } = parsed.data;
  const ctx = await context(orderId, invoiceId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (ctx.invoice.status !== "draft") return { ok: false, error: "invoiceNotDraft" };
  const { data: line, error: loadError } = await ctx.supabase.from("invoice_lines").select("authorized_quantity,authorized_unit_price_cents").eq("id", lineId).eq("invoice_id", invoiceId).is("deleted_at", null).maybeSingle();
  if (loadError || !line) return { ok: false, error: loadError ? "load" : "notFound" };
  if (quantity > line.authorized_quantity || unit_price_cents > line.authorized_unit_price_cents) return { ok: false, error: "invoiceCap" };
  const { data, error } = await ctx.supabase.from("invoice_lines").update({ quantity, unit_price_cents, taxable }).eq("id", lineId).eq("invoice_id", invoiceId).eq("updated_at", updatedAt).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? invoiceError(error) : "changedElsewhere" };
  refresh(orderId);
  return { ok: true, id: invoiceId };
}

export async function removeInvoiceLine(input: unknown): Promise<OrderResult> {
  const parsed = invoiceLineCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const { orderId, invoiceId, lineId, updatedAt } = parsed.data;
  const ctx = await context(orderId, invoiceId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (ctx.invoice.status !== "draft") return { ok: false, error: "invoiceNotDraft" };
  const { data, error } = await ctx.supabase.from("invoice_lines").update({ deleted_at: new Date().toISOString() }).eq("id", lineId).eq("invoice_id", invoiceId).eq("updated_at", updatedAt).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: error ? invoiceError(error) : "changedElsewhere" };
  refresh(orderId);
  return { ok: true, id: invoiceId };
}

export async function discardInvoiceDraft(input: unknown): Promise<OrderResult> {
  const parsed = invoiceCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await context(parsed.data.orderId, parsed.data.invoiceId);
  if (!ctx) return { ok: false, error: "notFound" };
  const { error } = await ctx.supabase.rpc("discard_invoice_draft", { p_invoice: ctx.invoice.id });
  if (error) return { ok: false, error: invoiceError(error) };
  refresh(parsed.data.orderId);
  redirect(`/orders/${parsed.data.orderId}`);
}

export async function issueInvoice(input: unknown): Promise<OrderResult> {
  const parsed = invoiceIssueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { orderId, invoiceId, odometer_out, notes } = parsed.data;
  const ctx = await context(orderId, invoiceId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (odometer_out < ctx.order.odometer_in) return { ok: false, fieldErrors: { odometer_out: "odometerOutLow" } };
  const { error } = await ctx.supabase.rpc("issue_invoice", { p_invoice: invoiceId, p_odometer_out: odometer_out, p_notes: notes });
  if (error) return { ok: false, error: invoiceError(error) };
  let warning: string | undefined;
  try { await freezeInvoicePdfDocument(ctx.supabase, orderId, invoiceId); } catch { warning = "invoicePdfPending"; }
  refresh(orderId);
  return { ok: true, id: invoiceId, ...(warning ? { warning } : {}) };
}

export async function freezeInvoicePdf(input: unknown): Promise<OrderResult> {
  const parsed = invoiceCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const { orderId, invoiceId } = parsed.data;
  const ctx = await context(orderId, invoiceId);
  if (!ctx) return { ok: false, error: "notFound" };
  if (ctx.invoice.status !== "issued") return { ok: false, error: "invoiceNotIssued" };
  try {
    const id = await freezeInvoicePdfDocument(ctx.supabase, orderId, invoiceId);
    refresh(orderId);
    return { ok: true, id };
  } catch { return { ok: false, error: "invoicePdfFailed" }; }
}

export async function voidInvoice(input: unknown): Promise<OrderResult> {
  const parsed = invoiceVoidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const ctx = await context(parsed.data.orderId, parsed.data.invoiceId);
  if (!ctx) return { ok: false, error: "notFound" };
  const { error } = await ctx.supabase.rpc("void_invoice", { p_invoice: ctx.invoice.id, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: invoiceError(error) };
  refresh(parsed.data.orderId);
  redirect(`/orders/${parsed.data.orderId}`);
}
