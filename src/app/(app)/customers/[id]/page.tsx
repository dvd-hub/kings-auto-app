import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Mail, Pencil, Phone, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ArchiveButton } from "@/components/archive-button";
import { ActivityForm } from "@/components/customers/activity-form";
import { archiveCustomer } from "@/app/(app)/customers/actions";
import { customerName, vehicleLabel, type Appointment } from "@/lib/customers";
import { appointmentStatusVariant, appointmentTypeVariant } from "@/lib/appointments";
import { formatDateTime, formatMiles, formatPhone } from "@/lib/format";
import { formatRoNumber } from "@/lib/format";
import { roStatusVariants, orderActivityText } from "@/lib/orders";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!customer) notFound();

  const [{ data: vehicles }, { data: appointments }, ordersResult] = await Promise.all([
    supabase.from("vehicles").select("*").eq("customer_id", id).is("deleted_at", null).order("created_at"),
    supabase.from("appointments").select("*").eq("customer_id", id).is("deleted_at", null).order("starts_at", { ascending: false }),
    supabase.from("repair_orders").select("*").eq("customer_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
  ]);
  const vehicleIds = (vehicles ?? []).map((v) => v.id);
  const appointmentIds = (appointments ?? []).map((a) => a.id);
  const filters = [`customer_id.eq.${id}`];
  if (vehicleIds.length) filters.push(`vehicle_id.in.(${vehicleIds.join(",")})`);
  if (appointmentIds.length) filters.push(`appointment_id.in.(${appointmentIds.join(",")})`);
  const { data: activities } = await supabase.from("activities").select("*").is("deleted_at", null)
    .or(filters.join(",")).order("occurred_at", { ascending: false }).limit(100);

  const now = new Date().toISOString();
  const upcoming = (appointments ?? []).filter((a) => a.starts_at >= now).reverse();
  const past = (appointments ?? []).filter((a) => a.starts_at < now);
  const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v]));
  const name = customerName(customer);
  const archive = archiveCustomer.bind(null, customer.id);

  const appointmentList = (items: Appointment[], empty: string) => items.length === 0
    ? <p className="text-secondary-foreground">{empty}</p>
    : <ul className="divide-y divide-border">
      {items.map((a) => {
        const vehicle = a.vehicle_id ? vehicleById.get(a.vehicle_id) : undefined;
        return <li key={a.id} className={`flex flex-wrap items-center gap-2 py-3 ${a.status === "cancelled" ? "text-secondary-foreground line-through" : ""}`}>
          <StatusBadge variant={appointmentTypeVariant(a.type, a.status)} label={t(`appointmentType.${a.type}`)} />
          <span className="font-semibold">{formatDateTime(a.starts_at)}</span>
          {a.status !== "scheduled" && <StatusBadge variant={appointmentStatusVariant(a.status)} label={t(`appointmentStatus.${a.status}`)} />}
          {(a.title || vehicle) && <span className="text-secondary-foreground">{[a.title, vehicle && vehicleLabel(vehicle)].filter(Boolean).join(" · ")}</span>}
        </li>;
      })}
    </ul>;

  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="break-words">{name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px]">
          {customer.phone && <a href={`tel:${customer.phone}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-link hover:underline"><Phone className="size-4" />{formatPhone(customer.phone)}</a>}
          {customer.email && <a href={`mailto:${customer.email}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-link hover:underline"><Mail className="size-4" />{customer.email}</a>}
          <StatusBadge variant="neutral" label={t(`customerSource.${customer.source}`)} />
          <StatusBadge variant="neutral" label={customer.preferred_language === "es" ? t("customers.languageEs") : t("customers.languageEn")} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link href={`/customers/${customer.id}/edit`}><Pencil className="size-4" />{t("common.edit")}</Link></Button>
        <ArchiveButton title={t("customers.archiveTitle")} text={t("customers.archiveText")} done={t("customers.archived")} redirectTo="/customers" action={archive} />
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <div className="rounded-card border border-border bg-surface p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2>{t("customers.repairOrders")}</h2>
            <Button asChild variant="outline"><Link href={`/orders/new?customer=${customer.id}`}><Plus className="size-4" />{t("customers.newRepairOrder")}</Link></Button>
          </div>
          {ordersResult.error ? <p role="alert">{t("errors.load")}</p> : !ordersResult.data?.length ? <p className="text-secondary-foreground">{t("customers.noRepairOrders")}</p> : <ul className="divide-y divide-border">
            {ordersResult.data.map((order) => <li key={order.id}><Link href={`/orders/${order.id}`} className="flex min-h-11 flex-wrap items-center gap-3 py-3"><span className="font-mono font-semibold">{formatRoNumber(order.ro_number)}</span><StatusBadge variant={roStatusVariants[order.status]} label={t(`ro_status.${order.status}`)} /><span>{vehicleById.has(order.vehicle_id) && vehicleLabel(vehicleById.get(order.vehicle_id)!)}</span><span className="text-sm text-secondary-foreground">{formatDateTime(order.received_at)}</span></Link></li>)}
          </ul>}
        </div>

        <div className="rounded-card border border-border bg-surface p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2>{t("customers.vehicles")}</h2>
            <Button asChild variant="outline"><Link href={`/customers/${customer.id}/vehicles/new`}><Plus className="size-4" />{t("customers.addVehicle")}</Link></Button>
          </div>
          {(vehicles ?? []).length === 0 ? <p className="text-secondary-foreground">{t("customers.noVehicles")}</p>
            : <div className="grid gap-3 sm:grid-cols-2">
              {vehicles!.map((v) => <Link key={v.id} href={`/vehicles/${v.id}/edit`} className="block min-h-11 rounded-control border border-border p-4 hover:bg-app-bg">
                <div className="font-semibold text-foreground">{vehicleLabel(v) || t("vehicles.untitled")}</div>
                {v.vin && <div className="mt-1 font-mono text-sm break-all">{v.vin}</div>}
                <div className="mt-1 text-sm text-secondary-foreground">
                  {[v.plate && `${v.plate}${v.plate_state ? ` (${v.plate_state})` : ""}`, v.color, v.odometer_mi !== null && formatMiles(v.odometer_mi)].filter(Boolean).join(" · ")}
                </div>
              </Link>)}
            </div>}
        </div>

        <div className="rounded-card border border-border bg-surface p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2>{t("customers.appointments")}</h2>
            <Button asChild variant="outline"><Link href={`/calendar?new=1&customer=${customer.id}`}><CalendarPlus className="size-4" />{t("customers.newAppointment")}</Link></Button>
          </div>
          <h3 className="mb-1 font-semibold">{t("customers.upcoming")}</h3>
          {appointmentList(upcoming, t("customers.noUpcoming"))}
          <h3 className="mt-5 mb-1 font-semibold">{t("customers.past")}</h3>
          {appointmentList(past, t("customers.noPast"))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-card border border-border bg-surface p-6">
          <h2 className="mb-4">{t("customers.addEntry")}</h2>
          <ActivityForm customerId={customer.id} />
        </div>
        <div className="rounded-card border border-border bg-surface p-6">
          <h2 className="mb-4">{t("customers.history")}</h2>
          {(activities ?? []).length === 0 ? <p className="text-secondary-foreground">{t("customers.noHistory")}</p>
            : <ol className="space-y-4">
              {activities!.map((a) => <li key={a.id} className="border-l-2 border-border pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge variant={a.kind === "system" ? "neutral" : "info"} label={t(`activityKind.${a.kind}`)} />
                  <span className="text-sm text-secondary-foreground">{formatDateTime(a.occurred_at)}</span>
                </div>
                {a.body && <p className="mt-1 whitespace-pre-wrap break-words">{orderActivityText(a.body, t)}</p>}
              </li>)}
            </ol>}
        </div>
        {customer.notes && <div className="rounded-card border border-border bg-surface p-6">
          <h2 className="mb-2">{t("customers.notes")}</h2>
          <p className="whitespace-pre-wrap break-words">{customer.notes}</p>
        </div>}
      </div>
    </div>
  </section>;
}
