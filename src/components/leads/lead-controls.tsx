"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";
import { SHOP_TIMEZONE } from "@/lib/config";
import { Constants } from "@/lib/database.types";
import type { Lead, LeadResult } from "@/lib/leads";
import { formatDateTime, formatRoNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AppointmentForm, type AppointmentDraft } from "@/components/calendar/appointment-form";
import { changeLeadStatus, setLeadCallDate, linkLeadAppointment, markLeadSpam } from "@/app/(app)/leads/actions";

export function LeadControls({ lead, customer, vehicles, appointments, orders, today }: {
  lead: Lead; customer: { id: string; name: string } | null; vehicles: { id: string; label: string }[];
  appointments: { id: string; starts_at: string; type: string; status: string }[];
  orders: { id: string; ro_number: number; status: string }[]; today: string;
}) {
  const t = useTranslations("leads"); const c = useTranslations("common"); const e = useTranslations("errors");
  const ty = useTranslations("appointmentType"); const ast = useTranslations("appointmentStatus"); const ost = useTranslations("ro_status");
  const router = useRouter();
  const [pending, start] = useTransition(); const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(lead.status === "spam" ? "new" : lead.status);
  const [reason, setReason] = useState(lead.lost_reason ?? ""); const [note, setNote] = useState(lead.lost_note ?? "");
  const [orderId, setOrderId] = useState(lead.repair_order_id ?? "");
  const [callDate, setCallDate] = useState(lead.next_call_on ?? "");
  const [appointmentId, setAppointmentId] = useState(lead.appointment_id ?? "");
  const [spamOpen, setSpamOpen] = useState(false); const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const command = { id: lead.id, updated_at: lead.updated_at };
  function run(action: () => Promise<LeadResult>, done?: () => void) {
    start(async () => {
      try {
        const result = await action();
        if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(e(result.error)); if (result.error === "leadChanged") router.refresh(); return; }
        setErrors({}); if (result.warning) toast.warning(e(result.warning)); else toast.success(t("saved"));
        done?.(); router.refresh();
      } catch { toast.error(e("save")); }
    });
  }
  if (lead.status === "spam") return <p className="rounded-card border border-border bg-surface p-6 text-secondary-foreground">{t("spamReadOnly")}</p>;
  const orderQuery = new URLSearchParams({ customer: customer?.id ?? "", ...(lead.vehicle_id ? { vehicle: lead.vehicle_id } : {}) });
  return <div className="space-y-6">
    <form noValidate className="space-y-4 rounded-card border border-border bg-surface p-6" onSubmit={event => { event.preventDefault(); run(() => changeLeadStatus({ ...command, status, lost_reason: reason, lost_note: note, repair_order_id: orderId || null })); }}>
      <h2>{t("state")}</h2>
      <Field id="status" label={t("state")} error={errors.status}><Select {...fieldAria("status", errors.status)} value={status} onChange={event => setStatus(event.target.value as typeof status)}>{Constants.public.Enums.lead_status.filter(s => s !== "spam").map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></Field>
      {status === "lost" && <>
        <Field id="lost_reason" label={t("lostReason")} error={errors.lost_reason}><Select {...fieldAria("lost_reason", errors.lost_reason)} value={reason} onChange={event => setReason(event.target.value as typeof reason)}><option value="">{t("chooseReason")}</option>{Constants.public.Enums.lead_lost_reason.map(r => <option key={r} value={r}>{t(`reasons.${r}`)}</option>)}</Select></Field>
        <Field id="lost_note" label={t("lostNote")} error={errors.lost_note}><Textarea {...fieldAria("lost_note", errors.lost_note)} value={note} onChange={event => setNote(event.target.value)} /></Field>
      </>}
      {status === "won" && <Field id="repair_order_id" label={t("winningOrder")} error={errors.repair_order_id}><Select {...fieldAria("repair_order_id", errors.repair_order_id)} value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">{t("chooseOrder")}</option>{orders.map(o => <option key={o.id} value={o.id}>{formatRoNumber(o.ro_number)} · {ost(o.status)}</option>)}</Select></Field>}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending}>{pending ? c("saving") : c("save")}</Button>
        {customer && <Button asChild variant="outline"><Link href={`/orders/new?${orderQuery}`}>{t("createOrder")}</Link></Button>}</div>
    </form>
    <form noValidate className="space-y-4 rounded-card border border-border bg-surface p-6" onSubmit={event => { event.preventDefault(); run(() => setLeadCallDate({ ...command, next_call_on: callDate })); }}>
      <h2>{t("nextCall")}</h2>
      <Field id="next_call_on" label={t("nextCallOptional")} error={errors.next_call_on}><Input {...fieldAria("next_call_on", errors.next_call_on)} type="date" value={callDate} onChange={event => setCallDate(event.target.value)} /></Field>
      <div className="flex flex-wrap gap-3"><Button type="submit" variant="outline" disabled={pending}>{c("save")}</Button><Button type="button" variant="outline" disabled={pending || !lead.next_call_on} onClick={() => run(() => setLeadCallDate({ ...command, next_call_on: "" }))}>{t("clearCall")}</Button></div>
    </form>
    <div className="space-y-4 rounded-card border border-border bg-surface p-6"><h2>{t("appointment")}</h2>
      {customer ? <>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); run(() => linkLeadAppointment({ ...command, appointment_id: appointmentId || null })); }}>
          <Field id="appointment_id" label={t("existingAppointment")} error={errors.appointment_id}><Select {...fieldAria("appointment_id", errors.appointment_id)} value={appointmentId} onChange={event => setAppointmentId(event.target.value)}><option value="">{t("noAppointment")}</option>{appointments.map(a => <option key={a.id} value={a.id}>{formatDateTime(a.starts_at)} · {ty(a.type)} · {ast(a.status)}</option>)}</Select></Field>
          <Button type="submit" variant="outline" disabled={pending}>{t("linkAppointment")}</Button>
        </form>
        {lead.appointment_id && <Link href={`/calendar?appointment=${lead.appointment_id}&date=${formatInTimeZone(appointments.find(a => a.id === lead.appointment_id)?.starts_at ?? `${today}T12:00:00Z`, SHOP_TIMEZONE, "yyyy-MM-dd")}`} className="inline-flex min-h-11 items-center text-link underline">{t("viewAppointment")}</Link>}
        <Button type="button" variant="outline" disabled={pending} onClick={() => setDraft({ date: today, time: "09:00", customer, vehicleId: lead.vehicle_id ?? undefined, lead: command, vehicles })}>{t("newEstimateAppointment")}</Button>
        <AppointmentForm draft={draft} onClose={() => setDraft(null)} onCreated={() => { setDraft(null); router.refresh(); }} />
      </> : <p>{t("noCustomer")}</p>}
    </div>
    <div className="rounded-card border border-border bg-surface p-6"><Button type="button" variant="outline" disabled={pending} onClick={() => setSpamOpen(true)}>{t("markSpam")}</Button></div>
    <Dialog open={spamOpen} onOpenChange={setSpamOpen}><DialogContent><DialogTitle>{t("spamTitle")}</DialogTitle><DialogDescription>{t("spamConfirmation")}</DialogDescription><DialogFooter>
      <Button type="button" variant="outline" disabled={pending} onClick={() => setSpamOpen(false)}>{c("cancel")}</Button><Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => markLeadSpam(command), () => setSpamOpen(false))}>{t("markSpam")}</Button>
    </DialogFooter></DialogContent></Dialog>
  </div>;
}
