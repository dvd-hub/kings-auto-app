"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { paymentError, type PaymentResult } from "@/lib/payments";
import { fieldErrors, paymentSchema, paymentVoidSchema } from "@/lib/validation";

function refresh(orderId: string) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/invoice`);
  revalidatePath("/billing");
}

export async function recordPayment(input: unknown): Promise<PaymentResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const values = parsed.data;
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const { data: balance, error: loadError } = await supabase.from("ro_balances").select("*").eq("repair_order_id", values.orderId).maybeSingle();
  if (loadError || !balance) return { ok: false, error: loadError ? "load" : "notFound" };
  if (values.kind === "payment" && balance.balance_cents !== null) {
    // Preview the overpayment only; the authoritative balance comes from the view.
    const overpayment = values.amount_cents - balance.balance_cents;
    if (overpayment > 0 && values.confirmedOverpaymentCents !== overpayment) {
      return { ok: false, error: "paymentOverpaymentConfirmation", overpaymentCents: overpayment };
    }
  }
  const { data, error } = await supabase.rpc("record_payment", {
    p_repair_order: values.orderId, p_kind: values.kind, p_amount_cents: values.amount_cents,
    p_paid_at: values.paid_at, p_method: values.method, p_payer: values.payer,
    p_payer_name: values.payer_name, p_claim_number: values.claim_number,
    p_reference: values.reference, p_notes: values.notes,
  });
  if (error || !data) return { ok: false, error: paymentError(error) };
  refresh(values.orderId);
  return { ok: true, id: data };
}

export async function voidPayment(input: unknown): Promise<PaymentResult> {
  const parsed = paymentVoidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { orderId, paymentId, reason } = parsed.data;
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const { data: payment, error: loadError } = await supabase.from("payments").select("id").eq("id", paymentId).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle();
  if (loadError || !payment) return { ok: false, error: loadError ? "load" : "notFound" };
  const { error } = await supabase.rpc("void_payment", { p_payment: payment.id, p_reason: reason });
  if (error) return { ok: false, error: paymentError(error) };
  refresh(orderId);
  return { ok: true, id: payment.id };
}
