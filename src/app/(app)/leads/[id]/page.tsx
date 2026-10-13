import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import { getLeadWebRequestDetail } from "@/lib/web-requests";
import { customerName, vehicleLabel } from "@/lib/customers";
import { formatDate, formatDateTime, formatPhone, formatRoNumber } from "@/lib/format";
import { leadActivityText, leadStatusVariants, shopToday } from "@/lib/leads";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { LeadControls } from "@/components/leads/lead-controls";
import { LeadActivityForm } from "@/components/leads/lead-activity-form";
import { WebRequestContent } from "@/components/calendar/web-request-panel";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const t = await getT();
  const supabase = await createClient();
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) return <p role="alert">{t("errors.load")}</p>;
  if (!lead) notFound();
  const [customerResult, vehicleResult, appointments, orders, vehicles, activities, web] = await Promise.all([
    lead.customer_id ? supabase.from("customers").select("*").eq("id", lead.customer_id).maybeSingle() : { data: null, error: null },
    lead.vehicle_id ? supabase.from("vehicles").select("*").eq("id", lead.vehicle_id).is("deleted_at", null).maybeSingle() : { data: null, error: null },
    lead.customer_id ? readAll((start, end) => supabase.from("appointments").select("id,starts_at,type,status").eq("customer_id", lead.customer_id!).is("deleted_at", null).order("starts_at", { ascending: false }).order("id").range(start, end)) : { data: [], error: null },
    lead.customer_id ? readAll((start, end) => supabase.from("repair_orders").select("id,ro_number,status").eq("customer_id", lead.customer_id!).is("deleted_at", null).order("created_at", { ascending: false }).order("id").range(start, end)) : { data: [], error: null },
    lead.customer_id ? readAll((start, end) => supabase.from("vehicles").select("id,year,make,model,trim").eq("customer_id", lead.customer_id!).is("deleted_at", null).order("created_at").order("id").range(start, end)) : { data: [], error: null },
    readAll((start, end) => supabase.from("activities").select("id,kind,body,occurred_at").eq("lead_id", id).is("deleted_at", null).order("occurred_at", { ascending: false }).order("id").range(start, end)),
    lead.source === "web" ? getLeadWebRequestDetail(id).then(data => ({ data, failed: false })).catch(() => ({ data: null, failed: true })) : { data: null, failed: false },
  ]);
  const customer = customerResult.data;
  const vehicle = vehicleResult.data;
  const today = shopToday();
  const relatedFailed = customerResult.error || vehicleResult.error || appointments.error || orders.error || vehicles.error;
  return <section className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div>
      <h1>{t("leads.detail")}{customer && ` · ${customerName(customer)}`}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3"><StatusBadge variant={leadStatusVariants[lead.status]} label={t(`leads.status.${lead.status}`)} /><StatusBadge variant="neutral" label={t(`leads.sources.${lead.source}`)} /><span className="text-sm text-secondary-foreground">{t("leads.received", { date: formatDateTime(lead.created_at) })}</span></div>
    </div><Button asChild variant="outline"><Link href="/leads">{t("leads.back")}</Link></Button></header>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        <div className="space-y-4 rounded-card border border-border bg-surface p-6"><h2>{t("leads.customer")}</h2>
          {customer ? <>
            {customer.deleted_at ? <p>{customerName(customer)} · {t("leads.archivedCustomer")}</p> : <Link href={`/customers/${customer.id}`} className="inline-flex min-h-11 items-center font-semibold text-link underline">{customerName(customer)}</Link>}
            <div className="flex flex-wrap gap-4">{customer.phone && <a href={`tel:${customer.phone}`} className="inline-flex min-h-11 items-center text-link underline">{formatPhone(customer.phone)}</a>}{customer.email && <a href={`mailto:${customer.email}`} className="inline-flex min-h-11 items-center break-all text-link underline">{customer.email}</a>}</div>
          </> : <p>{t("leads.noCustomer")}</p>}
          <h3 className="font-semibold">{t("leads.vehicle")}</h3>
          {vehicle ? <Link href={`/vehicles/${vehicle.id}/edit`} className="inline-flex min-h-11 flex-col justify-center text-link underline"><span>{vehicleLabel(vehicle)}</span>{vehicle.vin && <span className="font-mono">{vehicle.vin}</span>}</Link> : <p>{t("leads.noVehicle")}</p>}
          <h3 className="font-semibold">{t("leads.summary")}</h3><p className="whitespace-pre-wrap break-words">{lead.summary || t("leads.notProvided")}</p>
          {lead.next_call_on && <p className={lead.next_call_on < today ? "font-semibold text-status-danger-text" : "text-secondary-foreground"}>{t("leads.nextCall")}: {formatDate(`${lead.next_call_on}T12:00:00Z`, "UTC")}{lead.next_call_on < today && ` · ${t("leads.overdue")}`}</p>}
          {lead.repair_order_id && <Link href={`/orders/${lead.repair_order_id}`} className="inline-flex min-h-11 items-center text-link underline">{t("leads.winningOrder")} · {orders.data.find(o => o.id === lead.repair_order_id) ? formatRoNumber(orders.data.find(o => o.id === lead.repair_order_id)!.ro_number) : t("leads.notProvided")}</Link>}
        </div>
        {lead.source === "web" && <div className="rounded-card border border-border bg-surface p-6">
          {web.failed ? <p role="alert">{t("errors.load")}</p> : web.data ? <WebRequestContent request={web.data} /> : <p>{t("webRequest.notFound")}</p>}
        </div>}
        <div className="space-y-4 rounded-card border border-border bg-surface p-6"><h2>{t("leads.history")}</h2>
          {lead.customer_id && <LeadActivityForm id={lead.id} />}
          {activities.error ? <p role="alert">{t("errors.load")}</p> : !activities.data.length ? <p className="text-secondary-foreground">{t("leads.noHistory")}</p> : <ol className="space-y-4 border-t border-border pt-4">
            {activities.data.map(a => <li key={a.id} className="border-l-2 border-border pl-3"><div className="flex flex-wrap items-center gap-2"><StatusBadge variant={a.kind === "system" ? "neutral" : "info"} label={t(`activityKind.${a.kind}`)} /><span className="text-sm text-secondary-foreground">{formatDateTime(a.occurred_at)}</span></div><p className="mt-2 whitespace-pre-wrap break-words">{leadActivityText(a.body, t)}</p></li>)}
          </ol>}
        </div>
      </div>
      {relatedFailed ? <p role="alert">{t("errors.load")}</p> : <LeadControls key={lead.updated_at} lead={lead} customer={customer && !customer.deleted_at ? { id: customer.id, name: customerName(customer) } : null}
        vehicles={vehicles.data.map(v => ({ id: v.id, label: vehicleLabel(v) }))} appointments={appointments.data} orders={orders.data} today={today} />}
    </div>
  </section>;
}
