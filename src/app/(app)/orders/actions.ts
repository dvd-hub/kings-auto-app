"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { formatRoNumber } from "@/lib/format";
import { orderError, orderEvent, type OrderResult } from "@/lib/orders";
import { fieldErrors, orderSchema, orderStatusSchema, orderActivitySchema } from "@/lib/validation";

function refreshOrder(id: string, customerId: string) {
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  revalidatePath(`/orders/${id}/edit`);
  revalidatePath(`/customers/${customerId}`);
}

export async function saveOrder(orderId: string | null, input: unknown): Promise<OrderResult> {
  if (orderId !== null && !z.uuid().safeParse(orderId).success) return { ok: false, error: "notFound" };
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const values = parsed.data;
  const { data: existing, error: existingError } = orderId ? await supabase.from("repair_orders").select("*").eq("id", orderId).is("deleted_at", null).maybeSingle() : { data: null, error: null };
  if (orderId && (existingError || !existing)) return { ok: false, error: "notFound" };
  if (existing && (values.customer_id !== existing.customer_id || values.vehicle_id !== existing.vehicle_id)) {
    const { count, error } = await supabase.from("estimates").select("id", { count: "exact", head: true }).eq("repair_order_id", existing.id).is("deleted_at", null).not("status", "in", "(draft,voided)");
    if (error) return { ok: false, error: orderError(error) };
    if (count) return { ok: false, error: "orderPartiesLocked" };
  }
  const [{ data: customer, error: customerError }, { data: vehicle, error: vehicleError }] = await Promise.all([
    supabase.from("customers").select("id").eq("id", values.customer_id).is("deleted_at", null).maybeSingle(),
    supabase.from("vehicles").select("id,customer_id,odometer_mi").eq("id", values.vehicle_id).is("deleted_at", null).maybeSingle(),
  ]);
  if (customerError || vehicleError) return { ok: false, error: "relatedNotFound" };
  if (!customer || !vehicle) return { ok: false, error: "relatedNotFound" };
  if (vehicle.customer_id !== customer.id) return { ok: false, error: "vehicleNotOwned", fieldErrors: { vehicle_id: "vehicleNotOwned" } };

  // The migration's BEFORE INSERT trigger assigns ro_number. The generated Insert
  // type incorrectly marks it required; this assertion does not add it to the payload.
  const result = orderId
    ? await supabase.from("repair_orders").update(values).eq("id", orderId).is("deleted_at", null).eq("updated_at", existing!.updated_at).select("id,ro_number").maybeSingle()
    : await supabase.from("repair_orders").insert(values as Database["public"]["Tables"]["repair_orders"]["Insert"]).select("id,ro_number").single();
  if (result.error || !result.data) return { ok: false, error: result.error ? orderError(result.error) : "changedElsewhere" };
  const saved = result.data;
  let warning: string | undefined;
  if (!orderId) {
    const { error } = await supabase.from("activities").insert({ repair_order_id: saved.id, customer_id: customer.id, kind: "system", body: orderEvent("createdActivity", { ro: formatRoNumber(saved.ro_number) }) });
    if (error) warning = "historySave";
  }
  if (vehicle.odometer_mi === null || values.odometer_in > vehicle.odometer_mi) {
    const { error } = await supabase.from("vehicles").update({ odometer_mi: values.odometer_in }).eq("id", vehicle.id).is("deleted_at", null).or(`odometer_mi.is.null,odometer_mi.lt.${values.odometer_in}`);
    if (error) warning = "odometerSave";
  }
  refreshOrder(saved.id, customer.id);
  if (existing && existing.customer_id !== customer.id) revalidatePath(`/customers/${existing.customer_id}`);
  if (warning) return { ok: true, id: saved.id, warning };
  redirect(`/orders/${saved.id}`);
}

export async function changeOrderStatus(input: unknown): Promise<OrderResult> {
  const parsed = orderStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "orderInvalid" };
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const { data: order } = await supabase.from("repair_orders").select("*").eq("id", parsed.data.id).is("deleted_at", null).maybeSingle();
  if (!order) return { ok: false, error: "notFound" };
  if (order.status === parsed.data.status) return { ok: true, id: order.id };
  const now = new Date().toISOString();
  const status = parsed.data.status;
  const { data: updated, error } = await supabase.from("repair_orders").update({ status, ...(["open", "in_progress"].includes(status) ? { completed_at: null, delivered_at: null } : {}), ...(status === "completed" ? { completed_at: now, delivered_at: null } : {}), ...(status === "delivered" ? { delivered_at: now } : {}) }).eq("id", order.id).is("deleted_at", null).eq("status", order.status).select("id").maybeSingle();
  if (error || !updated) return { ok: false, error: error ? orderError(error) : "changedElsewhere" };
  const { error: activityError } = await supabase.from("activities").insert({ repair_order_id: order.id, customer_id: order.customer_id, kind: "status_change", body: orderEvent("statusActivity", { ro: formatRoNumber(order.ro_number), status }) });
  refreshOrder(order.id, order.customer_id);
  return { ok: true, id: order.id, ...(activityError ? { warning: "historySave" } : {}) };
}

export async function addOrderActivity(input: unknown): Promise<OrderResult> {
  const parsed = orderActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const { data: order } = await supabase.from("repair_orders").select("id,customer_id").eq("id", parsed.data.repair_order_id).is("deleted_at", null).maybeSingle();
  if (!order) return { ok: false, error: "notFound" };
  const { data, error } = await supabase.from("activities").insert({ ...parsed.data, customer_id: order.customer_id }).select("id").single();
  if (error || !data) return { ok: false, error: orderError(error) };
  refreshOrder(order.id, order.customer_id);
  return { ok: true, id: data.id };
}
