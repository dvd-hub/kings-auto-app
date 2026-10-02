"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";
import { CustomerSearch } from "@/components/customer-search";
import { createAppointment, updateAppointment } from "@/app/(app)/calendar/actions";
import { createClient } from "@/lib/supabase/client";
import { Constants, type Database } from "@/lib/database.types";
import { customerName, vehicleLabel } from "@/lib/customers";
import { APPOINTMENT_DURATIONS, type FieldErrors } from "@/lib/validation";

type AppointmentType = Database["public"]["Enums"]["appointment_type"];
export type AppointmentDraft = {
  date: string; time: string; customer: { id: string; name: string } | null;
  /** Present when editing an existing appointment. */
  existing?: { id: string; type: AppointmentType; duration: number; vehicleId: string | null; title: string | null; notes: string | null };
};

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 480];

export function AppointmentForm({ draft, onClose, onCreated }: {
  draft: AppointmentDraft | null; onClose: () => void; onCreated: () => void;
}) {
  return <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      {draft && <FormBody key={draft.existing?.id ?? `${draft.date}-${draft.time}-${draft.customer?.id ?? ""}`} draft={draft} onClose={onClose} onCreated={onCreated} />}
    </DialogContent>
  </Dialog>;
}

function FormBody({ draft, onClose, onCreated }: { draft: AppointmentDraft; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("calendar");
  const ty = useTranslations("appointmentType");
  const c = useTranslations("common");
  const e = useTranslations("errors");
  const [type, setType] = useState<AppointmentType>(draft.existing?.type ?? "estimate");
  const [date, setDate] = useState(draft.date);
  const [time, setTime] = useState(draft.time);
  const [duration, setDuration] = useState(String(draft.existing?.duration ?? APPOINTMENT_DURATIONS.estimate));
  const [customer, setCustomer] = useState(draft.customer);
  const [vehicles, setVehicles] = useState<{ id: string; label: string }[]>([]);
  const [vehicleId, setVehicleId] = useState(draft.existing?.vehicleId ?? "");
  const [title, setTitle] = useState(draft.existing?.title ?? "");
  const [notes, setNotes] = useState(draft.existing?.notes ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const existing = draft.existing;

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    createClient().from("vehicles").select("id, year, make, model, trim, plate").eq("customer_id", customer.id).is("deleted_at", null).order("created_at")
      .then(({ data }) => {
        if (!cancelled) setVehicles((data ?? []).map((v) => ({ id: v.id, label: [vehicleLabel(v), v.plate].filter(Boolean).join(" · ") || v.id })));
      });
    return () => { cancelled = true; };
  }, [customer]);

  function changeType(next: AppointmentType) {
    setType(next);
    setDuration(String(APPOINTMENT_DURATIONS[next]));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const values = { type, date, time, duration, customer_id: customer?.id ?? null, vehicle_id: customer && vehicleId ? vehicleId : null, title, notes };
      const result = existing ? await updateAppointment(existing.id, values) : await createAppointment(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(e(result.error === "notEditable" || result.error === "notFound" ? result.error : "save"));
        return;
      }
      toast.success(existing ? t("updated") : t("created"));
      onCreated();
    });
  }

  const durations = DURATIONS.includes(Number(duration)) ? DURATIONS : [...DURATIONS, Number(duration)].sort((a, b) => a - b);
  return <>
    <DialogTitle className="font-display text-[22px] font-bold">{existing ? t("editTitle") : t("newTitle")}</DialogTitle>
    <DialogDescription className="sr-only">{existing ? t("editTitle") : t("newTitle")}</DialogDescription>
    <form noValidate onSubmit={submit} className="space-y-4 text-[15px]">
      <Field id="type" label={t("type")} error={errors.type}>
        <Select {...fieldAria("type", errors.type)} value={type} onChange={(event) => changeType(event.target.value as AppointmentType)}>
          {Constants.public.Enums.appointment_type.map((v) => <option key={v} value={v}>{ty(v)}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="date" label={t("date")} error={errors.date}><Input {...fieldAria("date", errors.date)} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field id="time" label={t("start")} error={errors.time}><Input {...fieldAria("time", errors.time)} type="time" step={900} value={time} onChange={(event) => setTime(event.target.value)} /></Field>
        <Field id="duration" label={t("duration")} error={errors.duration}>
          <Select {...fieldAria("duration", errors.duration)} value={duration} onChange={(event) => setDuration(event.target.value)}>
            {durations.map((m) => <option key={m} value={m}>{t("minutes", { count: m })}</option>)}
          </Select>
        </Field>
      </div>
      <Field id="customer_id" label={t("customer")} error={errors.customer_id}>
        {customer
          ? <div className="flex min-h-11 items-center justify-between gap-2 rounded-control border border-input bg-input-bg pl-3">
            <span id="customer_id" className="font-semibold">{customer.name}</span>
            <Button type="button" variant="ghost" className="min-w-11 px-2" aria-label={t("clearCustomer")}
              onClick={() => { setCustomer(null); setVehicleId(""); setVehicles([]); }}><X className="size-5" /></Button>
          </div>
          : <CustomerSearch label={t("customer")} placeholder={t("searchCustomer")} onSelect={(option) => { setVehicleId(""); setCustomer({ id: option.id, name: customerName(option) }); }} />}
      </Field>
      <Field id="vehicle_id" label={t("vehicle")} error={errors.vehicle_id}>
        <Select {...fieldAria("vehicle_id", errors.vehicle_id)} value={vehicleId} disabled={!customer} onChange={(event) => setVehicleId(event.target.value)}>
          <option value="">{customer ? t("noVehicle") : t("chooseCustomerFirst")}</option>
          {customer && vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </Select>
      </Field>
      <Field id="title" label={`${t("titleField")} · ${c("optional")}`} error={errors.title}><Input {...fieldAria("title", errors.title)} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field id="notes" label={t("notes")} error={errors.notes}><Textarea {...fieldAria("notes", errors.notes)} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" disabled={pending}>{pending ? c("saving") : existing ? t("saveChanges") : t("create")}</Button>
        <Button type="button" variant="outline" onClick={onClose}>{c("cancel")}</Button>
      </div>
    </form>
  </>;
}
