"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { SHOP_TIMEZONE } from "@/lib/config";
import { orderError, orderEvent } from "@/lib/orders";
import { appointmentSchema, fieldErrors, type FieldErrors } from "@/lib/validation";
import { getWebRequestDetail, type WebRequestDetail } from "@/lib/web-requests";

export type AppointmentResult = { ok: true; id: string; warning?: string } | { ok: false; error?: string; fieldErrors?: FieldErrors };

const webRequestSchema = z.object({ appointmentId: z.uuid() });

export async function getWebRequest(input: unknown): Promise<{ ok: true; data: WebRequestDetail | null } | { ok: false }> {
  const parsed = webRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    return { ok: true, data: await getWebRequestDetail(parsed.data.appointmentId) };
  } catch {
    return { ok: false };
  }
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Prepared =
  | { ok: false; result: AppointmentResult }
  | { ok: true; supabase: Supabase; a: z.output<typeof appointmentSchema>; startsAt: Date; endsAt: Date };

/** Validates the input, checks customer and vehicle, and converts date + time from the shop's time zone. */
async function prepare(input: unknown): Promise<Prepared> {
  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, result: { ok: false, fieldErrors: fieldErrors(parsed.error) } };
  const a = parsed.data;
  const supabase = await createClient();

  if (!(await supabase.auth.getUser()).data.user) return { ok: false, result: { ok: false, error: "notFound" } };
  if (a.repair_order_id) {
    const { data: order } = await supabase.from("repair_orders").select("customer_id").eq("id", a.repair_order_id).is("deleted_at", null).maybeSingle();
    if (!order) return { ok: false, result: { ok: false, error: "notFound" } };
    if (order.customer_id !== a.customer_id) return { ok: false, result: { ok: false, error: "appointmentCustomerMismatch" } };
  }
  if (a.customer_id) {
    const { data } = await supabase.from("customers").select("id").eq("id", a.customer_id).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, result: { ok: false, fieldErrors: { customer_id: "required" } } };
  }
  if (a.vehicle_id) {
    if (!a.customer_id) return { ok: false, result: { ok: false, fieldErrors: { vehicle_id: "vehicleCustomer" } } };
    const { data } = await supabase.from("vehicles").select("id").eq("id", a.vehicle_id).eq("customer_id", a.customer_id).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, result: { ok: false, fieldErrors: { vehicle_id: "vehicleCustomer" } } };
  }

  const startsAt = fromZonedTime(`${a.date}T${a.time}:00`, SHOP_TIMEZONE);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, result: { ok: false, fieldErrors: { date: "required" } } };
  const endsAt = new Date(startsAt.getTime() + a.duration * 60_000);
  return { ok: true, supabase, a, startsAt, endsAt };
}

const shortWhen = (date: Date | string) => formatInTimeZone(date, SHOP_TIMEZONE, "MM/dd h:mm a");

export async function createAppointment(input: unknown): Promise<AppointmentResult> {
  const prepared = await prepare(input);
  if (!prepared.ok) return prepared.result;
  const { supabase, a, startsAt, endsAt } = prepared;

  const { data: row, error } = await supabase.from("appointments").insert({
    type: a.type, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
    customer_id: a.customer_id, vehicle_id: a.vehicle_id, title: a.title, notes: a.notes,
    ...(a.repair_order_id ? { repair_order_id: a.repair_order_id } : {}),
  }).select("id").single();
  if (error || !row) return { ok: false, error: orderError(error) };

  if (a.customer_id) {
    const t = await getT();
    await supabase.from("activities").insert({
      kind: "system", appointment_id: row.id, customer_id: a.customer_id, vehicle_id: a.vehicle_id,
      body: t("calendar.activityScheduled", { when: shortWhen(startsAt) }),
    });
    revalidatePath(`/customers/${a.customer_id}`);
  }
  if (a.repair_order_id) {
    const { error: historyError } = await supabase.from("activities").insert({ kind: "system", repair_order_id: a.repair_order_id, appointment_id: row.id, customer_id: a.customer_id, vehicle_id: a.vehicle_id, body: orderEvent("appointmentCreatedActivity", {}) });
    revalidatePath(`/orders/${a.repair_order_id}`);
    if (historyError) { revalidatePath("/calendar"); return { ok: true, id: row.id, warning: "historySave" }; }
  }
  revalidatePath("/calendar");
  return { ok: true, id: row.id };
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["scheduled", "completed", "no_show", "cancelled"]),
});

export async function setAppointmentStatus(input: unknown): Promise<AppointmentResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "save" };
  const supabase = await createClient();
  let query = supabase.from("appointments").update({ status: parsed.data.status })
    .eq("id", parsed.data.id).is("deleted_at", null);
  // Check the current status in the update itself so a concurrent change cannot confirm it twice.
  if (parsed.data.status === "scheduled") query = query.eq("status", "requested");
  const { data: row, error } = await query.select("id, customer_id, vehicle_id, repair_order_id").single();
  if (error || !row) return { ok: false, error: "save" };

  if (row.repair_order_id) revalidatePath(`/orders/${row.repair_order_id}`);
  if (row.customer_id) {
    const t = await getT();
    await supabase.from("activities").insert({
      kind: "system", appointment_id: row.id, customer_id: row.customer_id, vehicle_id: row.vehicle_id,
      body: t("calendar.activityStatus", { status: t(`appointmentStatus.${parsed.data.status}`) }),
    });
    revalidatePath(`/customers/${row.customer_id}`);
  }
  revalidatePath("/calendar");
  return { ok: true, id: row.id };
}

export async function updateAppointment(id: string, input: unknown): Promise<AppointmentResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "notFound" };
  const prepared = await prepare(input);
  if (!prepared.ok) return prepared.result;
  const { supabase, a, startsAt, endsAt } = prepared;

  const { data: current } = await supabase.from("appointments").select("id, status, starts_at, customer_id, repair_order_id, updated_at")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (!current) return { ok: false, error: "notFound" };
  if (current.repair_order_id) {
    const { data: order } = await supabase.from("repair_orders").select("customer_id").eq("id", current.repair_order_id).is("deleted_at", null).maybeSingle();
    if (!order || order.customer_id !== a.customer_id) return { ok: false, error: "appointmentCustomerMismatch" };
  }
  if (current.status !== "scheduled" && current.status !== "requested") return { ok: false, error: "notEditable" };

  const { data: row, error } = await supabase.from("appointments").update({
    type: a.type, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
    customer_id: a.customer_id, vehicle_id: a.vehicle_id, title: a.title, notes: a.notes,
  }).eq("id", id).eq("status", current.status).eq("updated_at", current.updated_at).is("deleted_at", null).select("id").single();
  if (error || !row) return { ok: false, error: "save" };

  if (new Date(current.starts_at).getTime() !== startsAt.getTime()) {
    const t = await getT();
    await supabase.from("activities").insert({
      kind: "system", appointment_id: row.id, customer_id: a.customer_id, vehicle_id: a.vehicle_id,
      body: t("calendar.activityRescheduled", { from: shortWhen(current.starts_at), to: shortWhen(startsAt) }),
    });
  }
  if (current.repair_order_id) revalidatePath(`/orders/${current.repair_order_id}`);
  for (const customerId of new Set([current.customer_id, a.customer_id])) if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath("/calendar");
  return { ok: true, id: row.id };
}
