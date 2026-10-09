import { addDays, addMonths, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { SHOP_TIMEZONE } from "@/lib/config";
import { customerName, vehicleLabel } from "@/lib/customers";
import { CalendarView, type CalendarAppointment, type CalendarViewName } from "@/components/calendar/calendar-view";

const DAY = "yyyy-MM-dd";

export default async function CalendarPage({ searchParams }: {
  searchParams: Promise<{ view?: string; date?: string; new?: string; customer?: string }>;
}) {
  const params = await searchParams;
  const t = await getT();
  const locale = await getLocale();
  const view: CalendarViewName = params.view === "day" || params.view === "month" ? params.view : "week";
  const today = format(toZonedTime(new Date(), SHOP_TIMEZONE), DAY);
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && !Number.isNaN(parseISO(params.date).getTime()) ? params.date : today;
  const anchor = parseISO(date);

  // Calendar days are plain yyyy-MM-dd strings in the shop's time zone; weeks start on Sunday (US).
  let first: Date, last: Date, prev: Date, next: Date;
  if (view === "day") { first = last = anchor; prev = addDays(anchor, -1); next = addDays(anchor, 1); }
  else if (view === "week") { first = startOfWeek(anchor, { weekStartsOn: 0 }); last = addDays(first, 6); prev = addDays(anchor, -7); next = addDays(anchor, 7); }
  else { first = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }); last = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }); prev = addMonths(anchor, -1); next = addMonths(anchor, 1); }
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(format(d, DAY));

  const rangeStart = fromZonedTime(`${days[0]}T00:00:00`, SHOP_TIMEZONE);
  const rangeEnd = fromZonedTime(`${format(addDays(last, 1), DAY)}T00:00:00`, SHOP_TIMEZONE);

  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments")
    .select("id, type, status, source, title, notes, starts_at, ends_at, customer_id, vehicle_id, repair_order_id, repair_orders(id, ro_number), customers(id, type, first_name, last_name, company_name), vehicles(id, year, make, model, trim)")
    .is("deleted_at", null).gte("starts_at", rangeStart.toISOString()).lt("starts_at", rangeEnd.toISOString())
    .order("starts_at");

  const minutesOf = (iso: string) => {
    const [h, m] = formatInTimeZone(iso, SHOP_TIMEZONE, "H:m").split(":").map(Number);
    return h * 60 + m;
  };
  const appointments: CalendarAppointment[] = (data ?? []).map((a) => {
    const day = formatInTimeZone(a.starts_at, SHOP_TIMEZONE, DAY);
    const startMin = minutesOf(a.starts_at);
    const endDay = formatInTimeZone(a.ends_at, SHOP_TIMEZONE, DAY);
    const endMin = endDay === day ? minutesOf(a.ends_at) : 24 * 60;
    return {
      id: a.id, type: a.type, status: a.status, source: a.source, title: a.title, notes: a.notes, startsAt: a.starts_at, endsAt: a.ends_at,
      day, startMin, endMin: Math.max(endMin, startMin + 15),
      customerId: a.customer_id, customerName: a.customers ? customerName(a.customers) : null,
      vehicleLabel: a.vehicles ? vehicleLabel(a.vehicles) : null,
      vehicleId: a.vehicle_id, repairOrderId: a.repair_order_id, roNumber: a.repair_orders?.ro_number ?? null,
    };
  });

  let preselected: { id: string; name: string } | null = null;
  if (params.customer) {
    const { data: c } = await supabase.from("customers").select("id, type, first_name, last_name, company_name")
      .eq("id", params.customer).is("deleted_at", null).maybeSingle();
    if (c) preselected = { id: c.id, name: customerName(c) };
  }

  const fmt = (d: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { ...options, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const usDate = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
  const heading = view === "month" ? fmt(date, { month: "long", year: "numeric" })
    : view === "day" ? `${fmt(date, { weekday: "long" })} ${usDate(date)}`
    : `${usDate(days[0])} – ${usDate(days[days.length - 1])}`;

  return <section className="space-y-6">
    <CalendarView view={view} date={date} today={today} days={days} heading={heading}
      weekdayLabels={days.slice(0, 7).map((d) => fmt(d, { weekday: "short" }))}
      prevDate={format(prev, DAY)} nextDate={format(next, DAY)} appointments={appointments} loadError={Boolean(error)}
      openNew={params.new === "1"} preselected={preselected} title={t("calendar.title")} />
  </section>;
}
