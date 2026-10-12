import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { CalendarPlus, Plus, UserPlus } from "lucide-react";
import { getT } from "@/i18n/server";
import { SHOP_TIMEZONE } from "@/lib/config";
import { getDashboardData } from "@/lib/dashboard";
import { customerName, vehicleLabel } from "@/lib/customers";
import { formatDate, formatDateTime, formatMoney, formatRoNumber, formatTime } from "@/lib/format";
import { appointmentStatusVariant, appointmentTypeVariant } from "@/lib/appointments";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

const rowClass = "block min-h-11 space-y-2 rounded-control border border-border p-4 hover:bg-app-bg focus-visible:outline-2 focus-visible:outline-ring";

export default async function DashboardPage() {
  const now = new Date();
  const t = await getT();
  const data = await getDashboardData(now);
  const calendarHref = (id: string, startsAt: string) => `/calendar?view=day&date=${formatInTimeZone(startsAt, SHOP_TIMEZONE, "yyyy-MM-dd")}&appointment=${id}`;
  const loadError = <p role="alert" className="text-status-danger-text">{t("errors.load")}</p>;
  const empty = (key: "noReceivable" | "noInvoices" | "noPayments" | "noAppointments" | "noRequests" | "noStages" | "noVehicles" | "noLateDeliveries" | "noEstimates") =>
    <p className="text-secondary-foreground">{t(`dashboard.${key}`)}</p>;
  const stageError = Boolean(data.stages.error || data.orders.error);

  return <section className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1>{t("dashboard.title")}</h1><p className="mt-1 text-secondary-foreground">{t("dashboard.shopDate", { date: formatDate(now) })}</p></div>
      <nav aria-label={t("dashboard.shortcuts")} className="flex min-w-0 flex-wrap gap-2">
        <Button asChild><Link href="/orders/new"><Plus aria-hidden="true" />{t("orders.new")}</Link></Button>
        <Button asChild variant="outline"><Link href="/customers/new"><UserPlus aria-hidden="true" />{t("customers.new")}</Link></Button>
        <Button asChild variant="outline"><Link href="/calendar?new=1"><CalendarPlus aria-hidden="true" />{t("calendar.new")}</Link></Button>
      </nav>
    </header>

    <section aria-labelledby="dashboard-money" className="space-y-3">
      <h2 id="dashboard-money">{t("dashboard.money")}</h2>
      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <Panel title={t("billing.totalPending")} href="/billing" linkLabel={t("dashboard.openBilling")}>
          {data.receivable.error ? loadError : <><Amount cents={data.receivable.total} />{data.receivable.total === 0 && empty("noReceivable")}</>}
        </Panel>
        <Panel title={t("dashboard.invoicedMonth")}>
          {data.invoiced.error ? loadError : <><Amount cents={data.invoiced.total} />{data.invoiced.count === 0 && empty("noInvoices")}</>}
        </Panel>
        <Panel title={t("dashboard.collectedMonth")}>
          {data.collected.error ? loadError : <><Amount cents={data.collected.total} /><p className="text-sm text-secondary-foreground">{t("dashboard.netPayments")}</p>{data.collected.count === 0 && empty("noPayments")}</>}
        </Panel>
      </div>
    </section>

    <section aria-labelledby="dashboard-today" className="space-y-3">
      <h2 id="dashboard-today">{t("dashboard.today")}</h2>
      <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
        <Panel title={t("dashboard.appointments")} href={`/calendar?view=day&date=${data.periods.today}`} linkLabel={t("dashboard.openCalendar")}>
          {data.appointments.error ? loadError : data.appointments.data.length === 0 ? empty("noAppointments") : <ul className="space-y-3">
            {data.appointments.data.map(appointment => <li key={appointment.id}>
              <Link href={calendarHref(appointment.id, appointment.starts_at)} className={rowClass}>
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono font-semibold">{formatTime(appointment.starts_at)}</span>
                  {appointment.repair_orders && <span className="font-mono">{formatRoNumber(appointment.repair_orders.ro_number)}</span>}
                </div>
                <p className="font-semibold">{appointment.customers ? customerName(appointment.customers) : t("common.none")}</p>
                <p className="text-secondary-foreground">{appointment.vehicles ? vehicleLabel(appointment.vehicles) : t("common.none")}</p>
                <div className="flex flex-wrap gap-2"><StatusBadge variant={appointmentTypeVariant(appointment.type, appointment.status)} label={t(`appointmentType.${appointment.type}`)} />
                  <StatusBadge variant={appointmentStatusVariant(appointment.status)} label={t(`appointmentStatus.${appointment.status}`)} /></div>
              </Link>
            </li>)}
          </ul>}
        </Panel>
        <Panel title={t("dashboard.webRequests")} href="/calendar" linkLabel={t("dashboard.openCalendar")}>
          {data.requests.error ? loadError : <>
            <p className="font-semibold">{t("dashboard.requestCount", { count: data.requests.count ?? 0 })}</p>
            {!data.requests.data?.length ? empty("noRequests") : <><p className="text-sm text-secondary-foreground">{t("dashboard.latestRequests")}</p><ul className="space-y-3">
              {data.requests.data.map(request => <li key={request.id}>
                <Link href={request.appointments ? calendarHref(request.appointments.id, request.appointments.starts_at) : "/calendar"} className={rowClass}>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{request.customers ? customerName(request.customers) : t("common.none")}</span>
                    {request.needs_tow && <StatusBadge variant="warning" label={t("webRequest.towNeeded")} />}</div>
                  <p className="text-sm text-secondary-foreground">{t("webRequest.received", { date: formatDateTime(request.created_at) })}</p>
                </Link>
              </li>)}
            </ul></>}
          </>}
        </Panel>
      </div>
    </section>

    <section aria-labelledby="dashboard-workshop" className="space-y-3">
      <h2 id="dashboard-workshop">{t("dashboard.workshop")}</h2>
      <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
        <Panel title={t("dashboard.stages")} href="/production" linkLabel={t("dashboard.openProduction")}>
          {stageError ? loadError : !data.stages.data.length ? empty("noStages") : <>
            {!data.orders.data.length && empty("noVehicles")}
            <ul className="space-y-2">{data.stages.data.map(stage => {
              const count = data.orders.data.filter(order => order.production_stage_id === stage.id).length;
              return <li key={stage.id}><Link href="/production" className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-muted/50 px-3 py-2 hover:bg-muted">
                <span className="min-w-0 break-words font-semibold">{stage.name}</span><span className="shrink-0 font-mono" aria-label={t("production.vehicleCount", { count })}>{count}</span>
              </Link></li>;
            })}</ul>
          </>}
        </Panel>
        <Panel title={t("dashboard.lateDeliveries")} href="/production" linkLabel={t("dashboard.openProduction")}>
          {data.orders.error ? loadError : !data.lateOrders.length ? empty("noLateDeliveries") : <ul className="space-y-3">
            {data.lateOrders.map(order => <li key={order.id}><Link href={`/orders/${order.id}`} className={rowClass}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono font-semibold">{formatRoNumber(order.ro_number)}</span><StatusBadge variant="danger" label={t("production.late")} /></div>
              <p className="font-semibold">{order.vehicles ? vehicleLabel(order.vehicles) : t("common.none")}</p>
              <p className="text-secondary-foreground">{order.customers ? customerName(order.customers) : t("common.none")}</p>
              <p className="text-sm text-status-danger-text">{t("production.promised", { date: formatDateTime(order.promised_at!) })}</p>
            </Link></li>)}
          </ul>}
        </Panel>
      </div>
    </section>

    <Panel title={t("dashboard.sentEstimates")}>
      {data.estimates.error ? loadError : <>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{t("dashboard.estimateCount", { count: data.estimates.data.length })}</p><Amount cents={data.estimates.total} /></div>
        {!data.estimates.data.length ? empty("noEstimates") : <ul className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.estimates.data.slice(0, 5).map(estimate => <li key={estimate.id}><Link href={`/orders/${estimate.repair_order_id}/estimates/${estimate.id}`} className={rowClass}>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono font-semibold">{estimate.repair_orders ? formatRoNumber(estimate.repair_orders.ro_number) : t("common.none")}</span><StatusBadge variant="info" label={t("estimate_status.sent")} /></div>
            <p>{t(`estimate_kind.${estimate.kind}`)}</p>
            <p className="text-sm text-secondary-foreground">{t("dashboard.sentAt", { date: estimate.sent_at ? formatDateTime(estimate.sent_at) : t("common.none") })}</p>
            <p className="font-mono font-semibold">{formatMoney(data.estimates.totals.get(estimate.id)!)}</p>
          </Link></li>)}
        </ul>}
        {data.estimates.data.length > 5 && <p className="text-sm text-secondary-foreground">{t("dashboard.showingEstimates", { count: 5, total: data.estimates.data.length })}</p>}
      </>}
    </Panel>
  </section>;
}

function Panel({ title, href, linkLabel, children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return <section aria-label={title} className="min-w-0 space-y-4 rounded-card border border-border bg-surface p-5 [overflow-wrap:anywhere]">
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><h3 className="font-display text-xl font-semibold">{title}</h3>
      {href && <Link href={href} className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline hover:text-link-hover">{linkLabel}</Link>}
    </header>{children}
  </section>;
}

function Amount({ cents }: { cents: number }) {
  return <p className="font-mono text-2xl font-semibold">{formatMoney(cents)}</p>;
}
