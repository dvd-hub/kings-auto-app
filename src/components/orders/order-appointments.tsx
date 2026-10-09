"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import type { Database } from "@/lib/database.types";
import type { RepairOrder } from "@/lib/orders";
import { SHOP_TIMEZONE } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { appointmentStatusVariant } from "@/lib/appointments";
import { linkAppointment } from "@/app/(app)/orders/phase3b2-actions";
import { AppointmentForm, type AppointmentDraft } from "@/components/calendar/appointment-form";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field, Select } from "@/components/form-field";

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
export function OrderAppointments({ order, customerName, appointments, available, loadFailed }: { order: RepairOrder; customerName: string; appointments: Appointment[]; available: Appointment[]; loadFailed: boolean }) {
  const t = useTranslations(), router = useRouter();
  const [draft, setDraft] = useState<AppointmentDraft | null>(null), [linkOpen, setLinkOpen] = useState(false), [selected, setSelected] = useState(""), [pending, start] = useTransition();
  const title = (a: Appointment) => `${formatDateTime(a.starts_at)} · ${t(`appointmentType.${a.type}`)}`;
  function link(appointmentId: string, unlink = false) {
    start(async () => {
      const result = await linkAppointment({ orderId: order.id, appointmentId, unlink });
      if (!result.ok) { toast.error(t(`errors.${result.error ?? "save"}`)); return; }
      if (result.warning) toast.warning(t(`errors.${result.warning}`)); else toast.success(t("phase3b2.saved"));
      setLinkOpen(false); setSelected(""); router.refresh();
    });
  }
  return <div className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2>{t("phase3b2.appointments")}</h2><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending || loadFailed} onClick={() => { setSelected(""); setLinkOpen(true); }}>{t("phase3b2.linkAppointment")}</Button><Button variant="outline" onClick={() => setDraft({ date: formatInTimeZone(new Date(), SHOP_TIMEZONE, "yyyy-MM-dd"), time: "09:00", customer: { id: order.customer_id, name: customerName }, vehicleId: order.vehicle_id, repairOrderId: order.id })}>{t("phase3b2.newAppointment")}</Button></div></div>
    {loadFailed ? <p role="alert">{t("errors.load")}</p> : !appointments.length ? <p>{t("phase3b2.noAppointments")}</p> : <ul className="divide-y divide-border">{appointments.map(a => <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><Link href={`/calendar?view=day&date=${formatInTimeZone(a.starts_at, SHOP_TIMEZONE, "yyyy-MM-dd")}`} className="inline-flex min-h-11 items-center text-link underline">{title(a)}</Link><StatusBadge variant={appointmentStatusVariant(a.status)} label={t(`appointmentStatus.${a.status}`)} /></div><Button variant="outline" disabled={pending} onClick={() => link(a.id, true)}>{t("phase3b2.unlinkAppointment")}</Button></li>)}</ul>}
    <Dialog open={linkOpen} onOpenChange={open => { if (!pending) setLinkOpen(open); }}><DialogContent showCloseButton={false}><DialogTitle>{t("phase3b2.linkAppointment")}</DialogTitle><DialogDescription>{t("phase3b2.chooseAppointment")}</DialogDescription>{available.length ? <Field id="linkedAppointment" label={t("phase3b2.chooseAppointment")}><Select id="linkedAppointment" value={selected} disabled={pending} onChange={e => setSelected(e.target.value)}><option value="">{t("phase3b2.chooseAppointment")}</option>{available.map(a => <option key={a.id} value={a.id}>{title(a)} · {t(`appointmentStatus.${a.status}`)}</option>)}</Select></Field> : <p>{t("phase3b2.noAvailableAppointments")}</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending || !selected} onClick={() => link(selected)}>{t("phase3b2.linkAppointment")}</Button><Button variant="outline" disabled={pending} onClick={() => setLinkOpen(false)}>{t("common.cancel")}</Button></div></DialogContent></Dialog>
    <AppointmentForm draft={draft} onClose={() => setDraft(null)} onCreated={() => { setDraft(null); router.refresh(); }} />
  </div>;
}
