"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CustomerSearch, type CustomerOption } from "@/components/customer-search";
import { customerName, vehicleLabel, type Vehicle } from "@/lib/customers";
import { manualLeadSources, type Lead, type LeadResult } from "@/lib/leads";
import { createLead, createLeadCustomer } from "@/app/(app)/leads/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";

export function LeadNewForm({ customer, vehicles, openLeads, openCount }: {
  customer: CustomerOption | null; vehicles: Pick<Vehicle, "id" | "year" | "make" | "model" | "trim">[];
  openLeads: Pick<Lead, "id" | "summary" | "status">[]; openCount: number;
}) {
  const t = useTranslations("leads"); const c = useTranslations("common"); const e = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newCustomer, setNewCustomer] = useState(false);
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [source, setSource] = useState<(typeof manualLeadSources)[number]>("phone");
  const [summary, setSummary] = useState(""); const [vehicleId, setVehicleId] = useState(""); const [nextCall, setNextCall] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customerErrors, setCustomerErrors] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<Extract<LeadResult, { ok: false }>["duplicates"]>();
  const [ackCustomer, setAckCustomer] = useState<string | null>(null);
  const [openWarning, setOpenWarning] = useState(false);
  function choose(id: string) {
    setVehicleId(""); setNewCustomer(false); setErrors({}); setCustomerErrors({}); setDuplicates(undefined); setOpenWarning(false);
    router.replace(`/leads/new?customer=${id}`, { scroll: false });
  }
  return <form noValidate className="space-y-5" onSubmit={event => {
    event.preventDefault(); start(async () => {
      const result = await createLead({ customer_id: customer?.id ?? "", vehicle_id: vehicleId || null, summary, source, next_call_on: nextCall, open_leads_ack: ackCustomer === customer?.id });
      if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) { toast.error(e(result.error)); if (result.error === "leadAlreadyOpen") setOpenWarning(true); } return; }
      if (result.warning) toast.warning(e(result.warning)); else toast.success(t("saved"));
      router.push(`/leads/${result.id}`); router.refresh();
    });
  }}>
    <div className="space-y-4 rounded-card border border-border bg-surface p-6">
      <h2>{t("customer")}</h2>
      {customer ? <div className="flex flex-wrap items-center justify-between gap-3"><Link href={`/customers/${customer.id}`} className="inline-flex min-h-11 items-center font-semibold text-link hover:underline">{customerName(customer)}</Link>
        <Button type="button" variant="outline" disabled={pending} onClick={() => { setVehicleId(""); router.replace("/leads/new", { scroll: false }); }}>{t("changeCustomer")}</Button></div>
        : <>
          <CustomerSearch label={t("searchCustomer")} placeholder={t("searchCustomer")} onSelect={option => choose(option.id)} />
          {errors.customer_id && <p role="alert" className="text-status-danger-text">{t("chooseCustomer")}</p>}
          <Button type="button" variant="outline" onClick={() => setNewCustomer(v => !v)}>{t("newCustomer")}</Button>
          {newCustomer && <fieldset className="space-y-4 rounded-control border border-border p-4"><legend className="px-2 font-semibold">{t("newCustomer")}</legend>
            {(["name", "phone", "email"] as const).map(key => <Field key={key} id={`contact-${key}`} label={t(key)} error={customerErrors[key]}>
              <Input {...fieldAria(`contact-${key}`, customerErrors[key])} type={key === "phone" ? "tel" : key === "email" ? "email" : "text"} value={contact[key]} onChange={event => setContact(v => ({ ...v, [key]: event.target.value }))} />
            </Field>)}
            {duplicates && <div role="alert" className="rounded-control bg-status-warning-bg p-3 text-status-warning-text"><p>{t("duplicateCustomer")}</p>{duplicates.map(d => <Button key={d.id} type="button" variant="outline" className="mt-2 mr-2" onClick={() => choose(d.id)}>{d.name}</Button>)}</div>}
            <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
              const result = await createLeadCustomer({ ...contact, source });
              if (!result.ok) { setCustomerErrors(result.fieldErrors ?? {}); setDuplicates(result.duplicates); if (result.error) toast.error(e(result.error)); return; }
              choose(result.id);
            })}>{pending ? c("saving") : t("createCustomer")}</Button>
          </fieldset>}
        </>}
      {(openCount > 0 || openWarning) && <div role="alert" className="space-y-2 rounded-control bg-status-warning-bg p-4 text-status-warning-text">
        <p>{t("openWarning")}</p><ul>{openLeads.map(lead => <li key={lead.id}><Link href={`/leads/${lead.id}`} className="inline-flex min-h-11 items-center text-link underline">{lead.summary || t(`status.${lead.status}`)}</Link></li>)}</ul>
        <label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" className="size-5" checked={ackCustomer === customer?.id} onChange={event => setAckCustomer(event.target.checked ? customer?.id ?? null : null)} />{t("openAcknowledge")}</label>
      </div>}
      <Field id="vehicle_id" label={t("vehicleOptional")} error={errors.vehicle_id}><Select {...fieldAria("vehicle_id", errors.vehicle_id)} disabled={!customer} value={vehicleId} onChange={event => setVehicleId(event.target.value)}>
        <option value="">{t("noVehicle")}</option>{vehicles.map(v => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
      </Select></Field>
    </div>
    <div className="space-y-4 rounded-card border border-border bg-surface p-6">
      <Field id="summary" label={t("summary")} error={errors.summary}><Textarea {...fieldAria("summary", errors.summary)} value={summary} onChange={event => setSummary(event.target.value)} /></Field>
      <Field id="source" label={t("source")} error={errors.source}><Select {...fieldAria("source", errors.source)} value={source} onChange={event => setSource(event.target.value as typeof source)}>{manualLeadSources.map(s => <option key={s} value={s}>{t(`sources.${s}`)}</option>)}</Select></Field>
      <Field id="next_call_on" label={t("nextCallOptional")} error={errors.next_call_on}><Input {...fieldAria("next_call_on", errors.next_call_on)} type="date" value={nextCall} onChange={event => setNextCall(event.target.value)} /></Field>
    </div>
    <div className="flex gap-3"><Button type="submit" disabled={pending || !customer}>{pending ? c("saving") : t("create")}</Button><Button asChild variant="outline"><Link href="/leads">{c("cancel")}</Link></Button></div>
  </form>;
}
