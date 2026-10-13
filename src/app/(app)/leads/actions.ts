"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/i18n/server";
import { createAppointment, type AppointmentResult } from "@/app/(app)/calendar/actions";
import { customerName } from "@/lib/customers";
import { activeLeadStatuses, leadError, leadEvent, type Lead, type LeadResult } from "@/lib/leads";
import { fieldErrors, leadCreateSchema, leadCustomerSchema, leadStatusSchema, leadCallDateSchema, leadCommandSchema, leadAppointmentSchema, leadActivitySchema, leadEstimateAppointmentSchema } from "@/lib/validation";

type Supabase = Awaited<ReturnType<typeof createClient>>;
async function authenticated() {
  const supabase = await createClient();
  return (await supabase.auth.getUser()).data.user ? supabase : null;
}
async function currentLead(supabase: Supabase, id: string) {
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  return error ? null : data;
}
function refresh(lead: Pick<Lead, "id" | "customer_id">) {
  revalidatePath("/leads"); revalidatePath(`/leads/${lead.id}`); revalidatePath("/dashboard");
  revalidatePath("/customers");
  if (lead.customer_id) { revalidatePath(`/customers/${lead.customer_id}`); revalidatePath(`/leads/new`); }
}
async function history(supabase: Supabase, lead: Lead, kind: "system" | "status_change", body: string) {
  const { error } = await supabase.from("activities").insert({ lead_id: lead.id, customer_id: lead.customer_id, kind, body });
  return error ? "historySave" : undefined;
}

export async function createLeadCustomer(input: unknown): Promise<LeadResult> {
  const parsed = leadCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await authenticated();
  if (!supabase) return { ok: false, error: "notFound" };
  const values = parsed.data;
  const matches = new Map<string, string>();
  for (const [column, value] of [["phone", values.phone], ["email", values.email]] as const) {
    if (!value) continue;
    const { data, error } = await supabase.from("customers").select("id,type,first_name,last_name,company_name").is("deleted_at", null).eq(column, value).limit(10);
    if (error) return { ok: false, error: "load" };
    data?.forEach(c => matches.set(c.id, customerName(c)));
  }
  if (matches.size) return { ok: false, duplicates: [...matches].map(([id, name]) => ({ id, name })) };
  const { data, error } = await supabase.from("customers").insert({
    type: "individual", first_name: values.name, phone: values.phone, email: values.email,
    source: values.source, preferred_language: await getLocale(),
  }).select("id").single();
  if (error || !data) return { ok: false, error: leadError(error) };
  revalidatePath("/customers"); revalidatePath("/leads/new");
  return { ok: true, id: data.id };
}

export async function createLead(input: unknown): Promise<LeadResult> {
  const parsed = leadCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await authenticated();
  if (!supabase) return { ok: false, error: "notFound" };
  const { open_leads_ack, ...values } = parsed.data;
  const { data: customer } = await supabase.from("customers").select("id").eq("id", values.customer_id).is("deleted_at", null).maybeSingle();
  if (!customer) return { ok: false, error: "relatedNotFound" };
  if (values.vehicle_id) {
    const { data } = await supabase.from("vehicles").select("id").eq("id", values.vehicle_id).eq("customer_id", customer.id).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, fieldErrors: { vehicle_id: "vehicleCustomer" } };
  }
  const { count, error: countError } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("customer_id", customer.id).is("deleted_at", null).in("status", [...activeLeadStatuses]);
  if (countError) return { ok: false, error: "load" };
  if (count && !open_leads_ack) return { ok: false, error: "leadAlreadyOpen" };
  const { data, error } = await supabase.from("leads").insert(values).select("*").single();
  if (error || !data) return { ok: false, error: leadError(error) };
  const warning = await history(supabase, data, "system", leadEvent("createdActivity"));
  refresh(data);
  return { ok: true, id: data.id, warning };
}

export async function changeLeadStatus(input: unknown): Promise<LeadResult> {
  const parsed = leadStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await authenticated();
  if (!supabase) return { ok: false, error: "notFound" };
  const v = parsed.data;
  const lead = await currentLead(supabase, v.id);
  if (!lead) return { ok: false, error: "notFound" };
  if (lead.updated_at !== v.updated_at) return { ok: false, error: "leadChanged" };
  if (lead.status === "spam") return { ok: false, error: "notEditable" };
  if (v.status === "won") {
    if (!lead.customer_id) return { ok: false, error: "relatedNotFound" };
    const { data } = await supabase.from("repair_orders").select("id").eq("id", v.repair_order_id!).eq("customer_id", lead.customer_id).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, error: "leadOrderCustomer" };
  }
  const { data, error } = await supabase.from("leads").update({
    status: v.status, lost_reason: v.status === "lost" ? v.lost_reason || null : null,
    lost_note: v.status === "lost" ? v.lost_note || null : null,
    repair_order_id: v.status === "won" ? v.repair_order_id : null,
  }).eq("id", lead.id).eq("updated_at", v.updated_at).is("deleted_at", null).select("*").maybeSingle();
  if (error) return { ok: false, error: leadError(error) };
  if (!data) return { ok: false, error: "leadChanged" };
  const warning = lead.status !== data.status ? await history(supabase, data, "status_change", leadEvent("statusActivity", { from: lead.status, to: data.status })) : undefined;
  refresh(data);
  return { ok: true, id: data.id, warning };
}

export async function setLeadCallDate(input: unknown): Promise<LeadResult> {
  const parsed = leadCallDateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await authenticated();
  if (!supabase) return { ok: false, error: "notFound" };
  const v = parsed.data;
  const lead = await currentLead(supabase, v.id);
  if (!lead) return { ok: false, error: "notFound" };
  if (lead.status === "spam") return { ok: false, error: "notEditable" };
  const { data, error } = await supabase.from("leads").update({ next_call_on: v.next_call_on }).eq("id", v.id).eq("updated_at", v.updated_at).is("deleted_at", null).select("*").maybeSingle();
  if (error) return { ok: false, error: leadError(error) };
  if (!data) return { ok: false, error: "leadChanged" };
  const warning = data.next_call_on !== lead.next_call_on ? await history(supabase, data, "system", leadEvent("callDateActivity", { date: data.next_call_on ?? "" })) : undefined;
  refresh(data);
  return { ok: true, id: data.id, warning };
}

export async function linkLeadAppointment(input: unknown): Promise<LeadResult> {
  const parsed = leadAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await authenticated();
  if (!supabase) return { ok: false, error: "notFound" };
  const v = parsed.data;
  const lead = await currentLead(supabase, v.id);
  if (!lead || !lead.customer_id) return { ok: false, error: "relatedNotFound" };
  if (lead.status === "spam") return { ok: false, error: "notEditable" };
  if (v.appointment_id) {
    const { data } = await supabase.from("appointments").select("id").eq("id", v.appointment_id).eq("customer_id", lead.customer_id).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, error: "appointmentCustomerMismatch" };
  }
  const { data, error } = await supabase.from("leads").update({ appointment_id: v.appointment_id }).eq("id", lead.id).eq("updated_at", v.updated_at).is("deleted_at", null).select("*").maybeSingle();
  if (error) return { ok: false, error: leadError(error) };
  if (!data) return { ok: false, error: "leadChanged" };
  const warning = lead.appointment_id !== data.appointment_id ? await history(supabase, data, "system", leadEvent("appointmentActivity", { linked: data.appointment_id ? 1 : 0 })) : undefined;
  refresh(data); revalidatePath("/calendar");
  return { ok: true, id: data.id, warning };
}

export async function markLeadSpam(input: unknown): Promise<LeadResult> {
  const parsed = leadCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await authenticated();
  if (!supabase) return { ok: false, error: "notFound" };
  const lead = await currentLead(supabase, parsed.data.id);
  if (!lead) return { ok: false, error: "notFound" };
  if (lead.updated_at !== parsed.data.updated_at) return { ok: false, error: "leadChanged" };
  if (lead.status === "spam") return { ok: true, id: lead.id };
  // The RPC changes only status. Clear loss metadata first to respect leads_lost_reason_chk.
  let clearedAt: string | null = null;
  if (lead.lost_reason || lead.lost_note) {
    const { data, error } = await supabase.from("leads").update({ lost_reason: null, lost_note: null })
      .eq("id", lead.id).eq("updated_at", lead.updated_at).is("deleted_at", null).select("updated_at").maybeSingle();
    if (error) return { ok: false, error: leadError(error) };
    if (!data) return { ok: false, error: "leadChanged" };
    clearedAt = data.updated_at;
  }
  const { error } = await supabase.rpc("mark_lead_spam", { p_lead_id: lead.id });
  if (error) {
    if (clearedAt) await supabase.from("leads").update({ lost_reason: lead.lost_reason, lost_note: lead.lost_note }).eq("id", lead.id).eq("status", "lost").eq("updated_at", clearedAt);
    refresh(lead);
    return { ok: false, error: leadError(error) };
  }
  const warning = await history(supabase, lead, "status_change", leadEvent("statusActivity", { from: lead.status, to: "spam" }));
  refresh(lead);
  return { ok: true, id: lead.id, warning };
}

export async function addLeadActivity(input: unknown): Promise<LeadResult> {
  const parsed = leadActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await authenticated();
  if (!supabase) return { ok: false, error: "notFound" };
  const lead = await currentLead(supabase, parsed.data.id);
  if (!lead || !lead.customer_id) return { ok: false, error: "relatedNotFound" };
  const { error } = await supabase.from("activities").insert({ lead_id: lead.id, customer_id: lead.customer_id, kind: parsed.data.kind, body: parsed.data.body });
  if (error) return { ok: false, error: leadError(error) };
  refresh(lead);
  return { ok: true, id: lead.id };
}

export async function createLeadEstimateAppointment(input: unknown): Promise<AppointmentResult> {
  const parsed = leadEstimateAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error, "appointment") };
  const supabase = await authenticated();
  if (!supabase) return { ok: false, error: "notFound" };
  const lead = await currentLead(supabase, parsed.data.id);
  if (!lead || !lead.customer_id) return { ok: false, error: "relatedNotFound" };
  if (lead.status === "spam") return { ok: false, error: "notEditable" };
  if (lead.updated_at !== parsed.data.updated_at) return { ok: false, error: "leadChanged" };
  if (parsed.data.appointment.customer_id !== lead.customer_id) return { ok: false, error: "appointmentCustomerMismatch" };
  const result = await createAppointment(parsed.data.appointment);
  if (!result.ok) return result;
  const linked = await linkLeadAppointment({ id: lead.id, updated_at: lead.updated_at, appointment_id: result.id });
  refresh(lead);
  return { ok: true, id: result.id, warning: !linked.ok ? "leadAppointmentLinkSave" : linked.warning ?? result.warning };
}
