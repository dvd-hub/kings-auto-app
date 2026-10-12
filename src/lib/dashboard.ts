import "server-only";
import { addDays, addMonths, format, parseISO, startOfMonth } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { SHOP_TIMEZONE } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import { getBillingBalances, totalPending } from "@/lib/billing";
import { isLateDelivery } from "@/lib/production";

export function dashboardPeriods(now: Date) {
  const today = formatInTimeZone(now, SHOP_TIMEZONE, "yyyy-MM-dd");
  const day = parseISO(today);
  const month = startOfMonth(day);
  const midnight = (date: Date) => fromZonedTime(`${format(date, "yyyy-MM-dd")}T00:00:00`, SHOP_TIMEZONE).toISOString();
  return { today, dayStart: midnight(day), dayEnd: midnight(addDays(day, 1)), monthStart: midnight(month), monthEnd: midnight(addMonths(month, 1)) };
}

export async function getDashboardData(now: Date) {
  const supabase = await createClient();
  const periods = dashboardPeriods(now);
  const [appointments, requests, stages, orders, estimates, balances, invoices, payments] = await Promise.all([
    readAll((start, end) => supabase.from("appointments")
      .select("id,starts_at,type,status,customers(type,first_name,last_name,company_name),vehicles(year,make,model,trim),repair_orders(id,ro_number)")
      .is("deleted_at", null).is("customers.deleted_at", null).is("vehicles.deleted_at", null).is("repair_orders.deleted_at", null)
      .neq("status", "cancelled").gte("starts_at", periods.dayStart).lt("starts_at", periods.dayEnd)
      .order("starts_at").order("id").range(start, end)),
    supabase.from("web_requests")
      .select("id,created_at,needs_tow,customers(type,first_name,last_name,company_name),appointments(id,starts_at)", { count: "exact" })
      .is("deleted_at", null).is("customers.deleted_at", null).is("appointments.deleted_at", null).eq("status", "new")
      .order("created_at", { ascending: false }).order("id").limit(5),
    readAll((start, end) => supabase.from("production_stages").select("id,name")
      .is("deleted_at", null).order("position").order("created_at").order("id").range(start, end)),
    readAll((start, end) => supabase.from("repair_orders")
      .select("id,ro_number,production_stage_id,promised_at,customers(type,first_name,last_name,company_name),vehicles(year,make,model,trim)")
      .is("deleted_at", null).is("customers.deleted_at", null).is("vehicles.deleted_at", null).in("status", ["open", "in_progress"])
      .order("promised_at", { nullsFirst: false }).order("id").range(start, end)),
    readAll((start, end) => supabase.from("estimates").select("id,repair_order_id,kind,sent_at,repair_orders(id,ro_number)")
      .is("deleted_at", null).is("repair_orders.deleted_at", null).eq("status", "sent")
      .order("sent_at", { ascending: false, nullsFirst: false }).order("id").range(start, end)),
    getBillingBalances(supabase),
    readAll((start, end) => supabase.from("invoices").select("id,total_cents")
      .is("deleted_at", null).eq("status", "issued").gte("issued_at", periods.monthStart).lt("issued_at", periods.monthEnd)
      .order("id").range(start, end)),
    readAll((start, end) => supabase.from("payments").select("id,kind,amount_cents")
      .is("deleted_at", null).eq("status", "recorded").gte("paid_at", periods.monthStart).lt("paid_at", periods.monthEnd)
      .order("id").range(start, end)),
  ]);

  // The view has no deleted_at; select only the IDs of the live, sent estimates above.
  const totalResults = await Promise.all(Array.from({ length: Math.ceil(estimates.data.length / 100) }, (_, index) =>
    supabase.from("estimate_totals").select("estimate_id,total_cents")
      .in("estimate_id", estimates.data.slice(index * 100, index * 100 + 100).map(estimate => estimate.id))));
  const totals = new Map(totalResults.flatMap(result => result.data ?? []).map(row => [row.estimate_id, row.total_cents]));
  const estimateError = Boolean(estimates.error || totalResults.some(result => result.error)
    || estimates.data.some(estimate => totals.get(estimate.id) == null));

  return {
    periods, appointments, requests, stages, orders,
    lateOrders: orders.data.filter(order => isLateDelivery(order.promised_at, now)),
    estimates: { data: estimates.data, totals, error: estimateError, total: estimates.data.reduce((sum, estimate) => sum + (totals.get(estimate.id) ?? 0), 0) },
    receivable: { error: balances.error, total: totalPending(balances.data) },
    invoiced: { error: invoices.error, count: invoices.data.length, total: invoices.data.reduce((sum, invoice) => sum + (invoice.total_cents ?? 0), 0) },
    collected: { error: payments.error, count: payments.data.length, total: payments.data.reduce((sum, payment) => sum + (payment.kind === "refund" ? -payment.amount_cents : payment.amount_cents), 0) },
  };
}
