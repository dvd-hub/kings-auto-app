import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { NewEstimateButtons, OrderStatusSelector, OrderActivityForm } from "@/components/orders/order-controls";
import { OrderTouchTargets } from "@/components/orders/touch-targets";
import { roStatusVariants, estimateStatusVariants, orderActivityText } from "@/lib/orders";
import { customerName, vehicleLabel } from "@/lib/customers";
import { formatRoNumber, formatMoney, formatDateTime, formatMiles, formatPhone } from "@/lib/format";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const t = await getT();
  const supabase = await createClient();
  const { data: order, error } = await supabase.from("repair_orders").select("*,customers(*),vehicles(*)").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) return <p role="alert">{t("errors.load")}</p>;
  if (!order) notFound();
  const [estimatesResult, totalsResult, activitiesResult] = await Promise.all([
    supabase.from("estimates").select("*").eq("repair_order_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("estimate_totals").select("*").eq("repair_order_id", id),
    supabase.from("activities").select("*").eq("repair_order_id", id).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(100),
  ]);
  const totals = new Map((totalsResult.data ?? []).map((row) => [row.estimate_id, row.total_cents]));
  const customer = order.customers;
  const vehicle = order.vehicles;
  return <section data-orders-module className="space-y-6"><OrderTouchTargets />
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-mono">{formatRoNumber(order.ro_number)}</h1><div className="mt-2 flex flex-wrap gap-2"><StatusBadge variant={roStatusVariants[order.status]} label={t(`ro_status.${order.status}`)} /><StatusBadge variant="neutral" label={t(`ro_type.${order.type}`)} /></div></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/orders/${id}/edit`}>{t("common.edit")}</Link></Button><OrderStatusSelector id={id} status={order.status} /></div></div>
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-2 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("orders.customerVehicle")}</h2>
        {customer && <p><Link href={`/customers/${customer.id}`} className="inline-flex min-h-11 items-center font-semibold text-link underline">{customerName(customer)}</Link>{customer.phone && <a href={`tel:${customer.phone}`} className="ml-3 inline-flex min-h-11 items-center text-link">{formatPhone(customer.phone)}</a>}</p>}
        {vehicle && <><p className="font-semibold">{vehicleLabel(vehicle)}</p>{vehicle.vin && <p className="break-all font-mono">{t("vehicles.vin")}: {vehicle.vin}</p>}{vehicle.plate && <p>{t("vehicles.plate")}: {vehicle.plate}</p>}</>}
      </div>
      <dl className="grid gap-4 rounded-card border border-border bg-surface p-5 sm:grid-cols-2 sm:p-6">{[
        [t("orders.odometerIn"), formatMiles(order.odometer_in)], ...(order.odometer_out !== null ? [[t("orders.odometerOut"), formatMiles(order.odometer_out)]] : []), [t("orders.received"), formatDateTime(order.received_at)], [t("orders.promised"), order.promised_at ? formatDateTime(order.promised_at) : t("common.none")], [t("orders.arrival"), t(`arrival_circumstance.${order.arrival_circumstance}`)],
      ].map(([label, value]) => <div key={label}><dt className="text-sm text-secondary-foreground">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
    </div>
    <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><h2 className="mb-3">{t("orders.requestedRepairs")}</h2><p className="whitespace-pre-wrap break-words">{order.requested_repairs}</p></div>
    {order.notes && <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><h2 className="mb-3">{t("orders.notes")}</h2><p className="whitespace-pre-wrap break-words">{order.notes}</p></div>}
    <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2>{t("orders.estimates")}</h2><NewEstimateButtons orderId={id} disabled={["cancelled", "delivered"].includes(order.status)} /></div>
      {estimatesResult.error || totalsResult.error ? <p role="alert">{t("errors.load")}</p> : !estimatesResult.data?.length ? <p className="text-secondary-foreground">{t("orders.noEstimates")}</p> : <ul className="divide-y divide-border">{estimatesResult.data.map((estimate) => <li key={estimate.id}><Link href={`/orders/${id}/estimates/${estimate.id}`} className={`flex min-h-11 flex-wrap items-center justify-between gap-3 py-4 ${estimate.status === "voided" ? "line-through" : ""}`}>
        <span className="font-semibold">{t(`estimate_kind.${estimate.kind}`)} {estimate.seq}</span><StatusBadge variant={estimateStatusVariants[estimate.status]} label={t(`estimate_status.${estimate.status}`)} /><span className="font-mono">{formatMoney(totals.get(estimate.id) ?? 0)}</span><span className="text-secondary-foreground">{formatDateTime(estimate.created_at)}</span>
      </Link></li>)}</ul>}
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><h2 className="mb-4">{t("customers.history")}</h2>{activitiesResult.error ? <p role="alert">{t("errors.load")}</p> : !activitiesResult.data?.length ? <p>{t("customers.noHistory")}</p> : <ol className="space-y-4">{activitiesResult.data.map((activity) => <li key={activity.id} className="border-l-2 border-border pl-3"><div className="flex flex-wrap items-center gap-2"><StatusBadge variant={activity.kind === "status_change" ? "info" : "neutral"} label={t(`activityKind.${activity.kind}`)} /><span className="text-sm text-secondary-foreground">{formatDateTime(activity.occurred_at)}</span></div><p className="mt-1 whitespace-pre-wrap break-words">{orderActivityText(activity.body, t)}</p></li>)}</ol>}</div>
      <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><h2 className="mb-4">{t("customers.addEntry")}</h2><OrderActivityForm orderId={id} /></div>
    </div>
  </section>;
}
