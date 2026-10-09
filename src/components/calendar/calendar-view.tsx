"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { SHOP_TIMEZONE } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AppointmentForm, type AppointmentDraft } from "@/components/calendar/appointment-form";
import { WebRequestPanel } from "@/components/calendar/web-request-panel";
import { setAppointmentStatus } from "@/app/(app)/calendar/actions";
import { appointmentBlockClass, appointmentStatusVariant, appointmentTypeVariant } from "@/lib/appointments";
import type { Database } from "@/lib/database.types";
import { formatDate, formatDateTime, formatTime, formatRoNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CalendarViewName = "day" | "week" | "month";
export type CalendarAppointment = {
  id: string; type: Database["public"]["Enums"]["appointment_type"]; status: Database["public"]["Enums"]["appointment_status"];
  source: Database["public"]["Tables"]["appointments"]["Row"]["source"];
  title: string | null; notes: string | null; startsAt: string; endsAt: string;
  day: string; startMin: number; endMin: number;
  repairOrderId: string | null; roNumber: number | null;
  customerId: string | null; customerName: string | null; vehicleLabel: string | null; vehicleId: string | null;
};

const START = 7 * 60;
const END = 19 * 60;
const SLOT = 30;
const SLOT_PX = 44;
const slots = Array.from({ length: (END - START) / SLOT }, (_, i) => START + i * SLOT);

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const label12 = (min: number) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, "0")} ${min < 720 ? "AM" : "PM"}`;
const usDay = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;

/** Assigns side-by-side lanes to overlapping appointments of one day. */
function lanes(items: CalendarAppointment[]) {
  const ends: number[] = [];
  const lane = new Map<string, number>();
  for (const a of items) {
    let i = ends.findIndex((end) => end <= a.startMin);
    if (i === -1) { i = ends.length; ends.push(a.endMin); } else ends[i] = a.endMin;
    lane.set(a.id, i);
  }
  return { lane, count: Math.max(1, ends.length) };
}

export function CalendarView(props: {
  view: CalendarViewName; date: string; today: string; days: string[]; heading: string; weekdayLabels: string[];
  prevDate: string; nextDate: string; appointments: CalendarAppointment[]; loadError: boolean;
  openNew: boolean; preselected: { id: string; name: string } | null; title: string;
}) {
  const { view, date, today, days, appointments } = props;
  const t = useTranslations("calendar");
  const ty = useTranslations("appointmentType");
  const e = useTranslations("errors");
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState<AppointmentDraft | null>(
    props.openNew ? { date: today, time: "09:00", customer: props.preselected } : null);
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);

  const href = (params: { view?: CalendarViewName; date?: string }) =>
    `${pathname}?${new URLSearchParams({ view: params.view ?? view, date: params.date ?? date })}`;
  const byDay = new Map<string, CalendarAppointment[]>();
  for (const a of appointments) byDay.set(a.day, [...(byDay.get(a.day) ?? []), a]);
  const create = (day: string, min = 9 * 60) => setDraft({ date: day, time: hhmm(min), customer: null });

  const edit = (a: CalendarAppointment) => setDraft({
    date: formatInTimeZone(a.startsAt, SHOP_TIMEZONE, "yyyy-MM-dd"), time: formatInTimeZone(a.startsAt, SHOP_TIMEZONE, "HH:mm"),
    customer: a.customerId ? { id: a.customerId, name: a.customerName ?? "" } : null,
    repairOrderId: a.repairOrderId ?? undefined,
    existing: {
      id: a.id, type: a.type, duration: Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60_000),
      vehicleId: a.vehicleId, title: a.title, notes: a.notes,
    },
  });

  function closeForm() {
    setDraft(null);
    if (props.openNew) router.replace(href({}));
  }

  const block = (a: CalendarAppointment, extra?: string, style?: React.CSSProperties, compact = false) => {
    const cancelled = a.status === "cancelled";
    const who = a.customerName ?? a.title;
    return <button key={a.id} type="button" onClick={() => setSelected(a)} style={style}
      className={cn("overflow-hidden rounded-control border-l-4 px-2 py-1 text-left text-sm leading-tight", appointmentBlockClass[appointmentTypeVariant(a.type, a.status)], a.status === "requested" && "border-dashed", cancelled && "line-through", extra)}>
      <span className={cn(compact && "block truncate")}><span className="font-semibold">{ty(a.type)}</span> <span>{formatTime(a.startsAt)}</span>{compact && who && <span> · {who}</span>}</span>
      {!compact && who && <span className="block truncate">{who}</span>}
    </button>;
  };

  const grid = <div className="overflow-x-auto rounded-card border border-border bg-surface">
    <div className="grid min-w-full" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(${days.length > 1 ? 120 : 200}px, 1fr))` }}>
      <div className="border-b border-border" />
      {days.map((d, i) => <div key={d} className={cn("border-b border-l border-border px-2 py-2 text-center", d === today && "bg-app-bg")}>
        <div className="text-sm text-secondary-foreground">{props.weekdayLabels[i % 7]}</div>
        <Link href={href({ view: "day", date: d })} className={cn("inline-flex min-h-11 items-center px-2 font-display text-lg font-bold", d === today && "text-primary")}>{usDay(d)}</Link>
      </div>)}
      <div>
        {slots.map((m) => <div key={m} className="relative border-b border-border pr-2 text-right text-xs text-secondary-foreground" style={{ height: SLOT_PX }}>
          {m % 60 === 0 && <span className="relative top-1">{label12(m)}</span>}
        </div>)}
      </div>
      {days.map((d) => {
        const items = (byDay.get(d) ?? []).filter((a) => a.endMin > START && a.startMin < END);
        const { lane, count } = lanes(items);
        return <div key={d} className="relative border-l border-border">
          {slots.map((m) => <button key={m} type="button" onClick={() => create(d, m)} aria-label={`${formatDate(`${d}T12:00:00Z`, "UTC")} ${t("emptySlot", { time: label12(m) })}`}
            className="block w-full border-b border-border hover:bg-app-bg focus-visible:bg-app-bg" style={{ height: SLOT_PX }} />)}
          {items.map((a) => {
            const top = ((Math.max(a.startMin, START) - START) / SLOT) * SLOT_PX;
            const height = Math.max(((Math.min(a.endMin, END) - Math.max(a.startMin, START)) / SLOT) * SLOT_PX - 2, SLOT_PX - 2);
            const width = 100 / count;
            return block(a, "absolute", { top, height, left: `calc(${lane.get(a.id)! * width}% + 2px)`, width: `calc(${width}% - 4px)` }, height < 60);
          })}
        </div>;
      })}
    </div>
  </div>;

  const outside = appointments.filter((a) => view !== "month" && (a.endMin <= START || a.startMin >= END));

  const mobileList = <div className="space-y-3">
    {days.map((d, i) => <div key={d} className="rounded-card border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className={cn("text-lg", d === today && "text-primary")}>{props.weekdayLabels[i % 7]} {usDay(d)}</h2>
        <Button type="button" variant="outline" className="min-w-11 px-2" aria-label={t("addOnDay", { date: usDay(d) })} onClick={() => create(d)}><Plus className="size-5" /></Button>
      </div>
      {(byDay.get(d) ?? []).length === 0 ? <p className="text-secondary-foreground">{t("noAppointments")}</p>
        : <div className="flex flex-col gap-2">{byDay.get(d)!.map((a) => block(a, "min-h-11 w-full"))}</div>}
    </div>)}
  </div>;

  const month = <div className="overflow-hidden rounded-card border border-border bg-surface">
    <div className="grid grid-cols-7">
      {props.weekdayLabels.map((w) => <div key={w} className="border-b border-border px-2 py-2 text-center text-sm font-semibold text-secondary-foreground">{w}</div>)}
      {days.map((d) => {
        const items = byDay.get(d) ?? [];
        const inMonth = d.slice(0, 7) === date.slice(0, 7);
        return <div key={d} className={cn("relative min-h-28 border-b border-l border-border p-1 first:border-l-0 [&:nth-child(7n+1)]:border-l-0", !inMonth && "bg-app-bg", d === today && "ring-2 ring-primary ring-inset")}>
          <button type="button" onClick={() => create(d)} aria-label={t("addOnDay", { date: usDay(d) })} className="absolute inset-0" />
          <Link href={href({ view: "day", date: d })} className={cn("relative inline-flex min-h-11 min-w-11 items-center justify-center font-semibold", inMonth ? "text-foreground" : "text-secondary-foreground")}>{Number(d.slice(8))}</Link>
          <div className="relative flex flex-col gap-1">
            {items.slice(0, 3).map((a) => block(a, "w-full text-xs", undefined, true))}
            {items.length > 3 && <Link href={href({ view: "day", date: d })} className="relative px-1 text-xs font-semibold text-link">{t("more", { count: items.length - 3 })}</Link>}
          </div>
        </div>;
      })}
    </div>
  </div>;

  return <>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1>{props.title}</h1>
        <p className="mt-1 font-display text-xl font-semibold text-secondary-foreground">{props.heading}</p>
      </div>
      <Button type="button" onClick={() => create(view === "day" ? date : today)}><Plus className="size-5" />{t("new")}</Button>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline"><Link href={href({ date: today })}>{t("today")}</Link></Button>
        <Button asChild variant="outline" className="min-w-11 px-2"><Link href={href({ date: props.prevDate })} aria-label={t("previous")}><ChevronLeft className="size-5" /></Link></Button>
        <Button asChild variant="outline" className="min-w-11 px-2"><Link href={href({ date: props.nextDate })} aria-label={t("next")}><ChevronRight className="size-5" /></Link></Button>
      </div>
      <nav aria-label={t("view")} className="inline-flex overflow-hidden rounded-control border border-input-border bg-surface">
        {(["day", "week", "month"] as const).map((v, i) => <Link key={v} href={href({ view: v })} aria-current={v === view ? "page" : undefined}
          className={cn("flex min-h-11 items-center px-4 font-semibold", i > 0 && "border-l border-input-border", v === view ? "bg-dark-button text-dark-button-foreground" : "text-foreground hover:bg-app-bg")}>{t(v)}</Link>)}
      </nav>
    </div>

    {props.loadError && <p role="alert" className="rounded-card bg-status-danger-bg p-4 text-status-danger-text">{e("load")}</p>}

    {view === "month" ? month : view === "week" ? <><div className="hidden md:block">{grid}</div><div className="md:hidden">{mobileList}</div></> : grid}

    {outside.length > 0 && <div className="flex flex-wrap gap-2">{outside.map((a) => block(a, "min-h-11"))}</div>}

    <AppointmentForm draft={draft} onClose={closeForm} onCreated={() => { closeForm(); router.refresh(); }} />
    <AppointmentDetail appointment={selected} onClose={() => setSelected(null)} onEdit={(a) => { setSelected(null); edit(a); }} />
  </>;
}

function AppointmentDetail({ appointment: a, onClose, onEdit }: { appointment: CalendarAppointment | null; onClose: () => void; onEdit: (a: CalendarAppointment) => void }) {
  const t = useTranslations("calendar");
  const ty = useTranslations("appointmentType");
  const st = useTranslations("appointmentStatus");
  const e = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();

  function setStatus(status: "scheduled" | "completed" | "no_show" | "cancelled") {
    if (!a) return;
    start(async () => {
      const result = await setAppointmentStatus({ id: a.id, status });
      if (!result.ok) { toast.error(e("save")); return; }
      toast.success(t("statusSaved"));
      onClose();
      router.refresh();
    });
  }

  return <Dialog open={a !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className={a?.source === "web" ? "max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl [&>button]:min-h-[44px] [&>button]:min-w-[44px]" : "sm:max-w-md"}>
      {a && <>
        <DialogTitle className="font-display text-[22px] font-bold">{a.title || ty(a.type)}</DialogTitle>
        <DialogDescription className="sr-only">{t("details")}</DialogDescription>
        <div className="space-y-3 text-[15px]">
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant={appointmentTypeVariant(a.type, a.status)} label={ty(a.type)} />
            <StatusBadge variant={appointmentStatusVariant(a.status)} label={st(a.status)} />
            {a.source === "web" && <StatusBadge variant="neutral" label={t("sourceWeb")} />}
          </div>
          <p className={cn("font-semibold", a.status === "cancelled" && "line-through text-secondary-foreground")}>{formatDateTime(a.startsAt)} – {formatTime(a.endsAt)}</p>
          {a.customerName && <p>{t("customer")}: <Link href={`/customers/${a.customerId}`} className="inline-flex min-h-11 items-center font-semibold text-link underline hover:text-link-hover">{a.customerName}</Link></p>}
          {a.repairOrderId && a.roNumber !== null && <p><Link href={`/orders/${a.repairOrderId}`} className="inline-flex min-h-11 items-center font-mono text-link underline">{formatRoNumber(a.roNumber)}</Link></p>}
          {a.vehicleLabel && <p>{t("vehicle")}: {a.vehicleLabel}</p>}
          {a.notes && <p className="whitespace-pre-wrap break-words text-secondary-foreground">{a.notes}</p>}
          {a.source === "web" && <WebRequestPanel key={a.id} appointmentId={a.id} />}
          {a.status === "requested" && <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onEdit(a)}><Pencil className="size-4" />{t("edit")}</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setStatus("scheduled")}>{t("confirm")}</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => setStatus("cancelled")}>{t("markCancelled")}</Button>
          </div>}
          {a.status === "scheduled" && <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onEdit(a)}><Pencil className="size-4" />{t("edit")}</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setStatus("completed")}>{t("markCompleted")}</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setStatus("no_show")}>{t("markNoShow")}</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => setStatus("cancelled")}>{t("markCancelled")}</Button>
          </div>}
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
