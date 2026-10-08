"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CustomerSearch, type CustomerOption } from "@/components/customer-search";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Constants } from "@/lib/database.types";
import { customerName, vehicleLabel, type Vehicle } from "@/lib/customers";
import { formatMiles } from "@/lib/format";
import type { FieldErrors } from "@/lib/validation";
import { saveOrder } from "@/app/(app)/orders/actions";

export type OrderFormValues = { customer_id: string; vehicle_id: string; type: string; odometer_in: string; odometer_out: string; requested_repairs: string; arrival_circumstance: string; received_at: string; promised_at: string; notes: string };

export function OrderForm({ orderId, initial, customer, vehicles, partiesLocked = false }: {
  orderId: string | null; initial: OrderFormValues; customer: CustomerOption | null; vehicles: Vehicle[]; partiesLocked?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [selected, setSelected] = useState(customer);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const options = vehicles.filter((vehicle) => vehicle.customer_id === selected?.id);
  const set = (key: keyof OrderFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const input = (key: keyof OrderFormValues, props: React.ComponentProps<"input"> = {}) => <Input {...fieldAria(key, errors[key])} value={values[key]} onChange={set(key)} {...props} />;
  const selectVehicle = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const vehicle = options.find((v) => v.id === event.target.value);
    setValues((v) => ({ ...v, vehicle_id: event.target.value, odometer_in: vehicle?.odometer_mi?.toString() ?? "" }));
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await saveOrder(orderId, values);
      if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(t(`errors.${result.error}`)); return; }
      if (result.warning) toast.warning(t(`errors.${result.warning}`));
      router.push(`/orders/${result.id}`);
      router.refresh();
    });
  }

  return <form noValidate onSubmit={submit} className="max-w-4xl space-y-6">
    <div className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6">
      <h2>{t("orders.customerVehicle")}</h2>
      {partiesLocked && <p className="rounded-control bg-status-info-bg p-3 text-status-info-text">{t("orders.partiesLocked")}</p>}
      <Field id="customer_id" label={t("orders.customer")} error={errors.customer_id}>
        {selected && <p className="mb-2 font-semibold">{customerName(selected)}</p>}
        {!partiesLocked && <CustomerSearch label={t("orders.searchCustomer")} placeholder={t("orders.searchCustomer")} onSelect={(next) => {
          setSelected(next);
          setValues((v) => ({ ...v, customer_id: next.id, vehicle_id: "", odometer_in: "" }));
          router.replace(`${orderId ? `/orders/${orderId}/edit` : "/orders/new"}?customer=${next.id}`, { scroll: false });
        }} />}
      </Field>
      <Field id="vehicle_id" label={t("orders.vehicle")} error={errors.vehicle_id}>
        <Select {...fieldAria("vehicle_id", errors.vehicle_id)} value={values.vehicle_id} disabled={partiesLocked || !selected || pending} onChange={selectVehicle}>
          <option value="">{t("orders.chooseVehicle")}</option>
          {options.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v) || t("vehicles.untitled")}{v.plate ? ` · ${v.plate}` : ""}</option>)}
        </Select>
      </Field>
      {selected && options.length === 0 && !partiesLocked && <p>{t("orders.noVehicles")} <Link href={`/customers/${selected.id}/vehicles/new`} className="inline-flex min-h-11 items-center font-semibold text-link underline">{t("customers.addVehicle")}</Link></p>}
    </div>
    <div className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6">
      <Field id="type" label={t("orders.type")} error={errors.type}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("orders.type")}>
          {Constants.public.Enums.ro_type.map((type) => <Button key={type} type="button" variant="outline" aria-pressed={values.type === type} className={values.type === type ? "border-foreground bg-muted" : ""} onClick={() => setValues((v) => ({ ...v, type }))}>{t(`ro_type.${type}`)}</Button>)}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="odometer_in" label={t("orders.odometerIn")} error={errors.odometer_in} hint={/^\d+$/.test(values.odometer_in) ? formatMiles(Number(values.odometer_in)) : undefined}>{input("odometer_in", { inputMode: "numeric" })}</Field>
        {orderId && <Field id="odometer_out" label={`${t("orders.odometerOut")} · ${t("common.optional")}`} error={errors.odometer_out}>{input("odometer_out", { inputMode: "numeric" })}</Field>}
      </div>
      <Field id="requested_repairs" label={t("orders.requestedRepairs")} hint={t("orders.repairsHint")} error={errors.requested_repairs}>
        <Textarea {...fieldAria("requested_repairs", errors.requested_repairs)} value={values.requested_repairs} onChange={set("requested_repairs")} />
      </Field>
      <Field id="arrival_circumstance" label={t("orders.arrival")} error={errors.arrival_circumstance}>
        <Select {...fieldAria("arrival_circumstance", errors.arrival_circumstance)} value={values.arrival_circumstance} onChange={set("arrival_circumstance")}>
          {Constants.public.Enums.arrival_circumstance.map((v) => <option key={v} value={v}>{t(`arrival_circumstance.${v}`)}</option>)}
        </Select>
      </Field>
      {values.arrival_circumstance !== "customer_present" && <p className="rounded-control bg-status-warning-bg p-3 text-status-warning-text">{t("orders.arrivalWarning")}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="received_at" label={t("orders.received")} hint={t("orders.shopTime")} error={errors.received_at}>{input("received_at", { type: "datetime-local" })}</Field>
        <Field id="promised_at" label={`${t("orders.promised")} · ${t("common.optional")}`} hint={t("orders.shopTime")} error={errors.promised_at}>{input("promised_at", { type: "datetime-local" })}</Field>
      </div>
      <Field id="notes" label={t("orders.notes")} error={errors.notes}><Textarea {...fieldAria("notes", errors.notes)} value={values.notes} onChange={set("notes")} /></Field>
    </div>
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending}>{pending ? t("common.saving") : orderId ? t("common.save") : t("orders.create")}</Button>
      <Button asChild variant="outline"><Link href={orderId ? `/orders/${orderId}` : "/orders"}>{t("common.cancel")}</Link></Button>
    </div>
  </form>;
}
