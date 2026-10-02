"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";
import { saveCustomer, type ActionResult } from "@/app/(app)/customers/actions";
import { Constants } from "@/lib/database.types";
import type { CustomerInput, FieldErrors } from "@/lib/validation";

type Values = Required<{ [K in keyof CustomerInput]: string }>;

export function CustomerForm({ customerId, initial }: { customerId: string | null; initial: Values }) {
  const t = useTranslations("customers");
  const c = useTranslations("common");
  const e = useTranslations("errors");
  const ct = useTranslations("customerType");
  const cs = useTranslations("customerSource");
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [duplicates, setDuplicates] = useState<Extract<ActionResult, { ok: false }>["duplicates"]>();
  const [pending, start] = useTransition();

  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));
  const input = (key: keyof Values, extra: React.ComponentProps<"input"> = {}) =>
    <Input {...fieldAria(key, errors[key])} value={values[key]} onChange={set(key)} {...extra} />;

  function submit(force: boolean) {
    start(async () => {
      const result = await saveCustomer(customerId, values, force);
      if (result.ok) {
        toast.success(t("saved"));
        router.push(`/customers/${result.id}`);
        router.refresh();
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setDuplicates(result.duplicates);
      if (result.error) toast.error(e(result.error === "notFound" ? "notFound" : "save"));
    });
  }

  const business = values.type === "business";
  return <form noValidate onSubmit={(event) => { event.preventDefault(); submit(false); }} className="space-y-5">
    <Card className="gap-5 p-6 text-[15px] ring-0 border border-border">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("type")}</legend>
        <div className="flex flex-wrap gap-2">
          {Constants.public.Enums.customer_type.map((type) => <label key={type}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-4 font-semibold ${values.type === type ? "border-dark-button bg-dark-button text-dark-button-foreground" : "border-input-border bg-surface text-foreground"}`}>
            <input type="radio" name="type" value={type} checked={values.type === type} onChange={set("type")} className="sr-only" />
            {ct(type)}
          </label>)}
        </div>
      </fieldset>

      {business && <Field id="company_name" label={t("company")} error={errors.company_name}>{input("company_name", { autoComplete: "organization" })}</Field>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="first_name" label={business ? `${t("firstName")} · ${c("optional")}` : t("firstName")} error={errors.first_name}>{input("first_name", { autoComplete: "given-name" })}</Field>
        <Field id="last_name" label={business ? `${t("lastName")} · ${c("optional")}` : t("lastName")} error={errors.last_name}>{input("last_name", { autoComplete: "family-name" })}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="phone" label={t("phone")} error={errors.phone} hint={t("contactHint")}>{input("phone", { type: "tel", autoComplete: "tel", inputMode: "tel" })}</Field>
        <Field id="email" label={t("email")} error={errors.email}>{input("email", { type: "email", autoComplete: "email" })}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="source" label={t("source")} error={errors.source}>
          <Select {...fieldAria("source", errors.source)} value={values.source} onChange={set("source")}>
            <option value="" disabled>{t("chooseSource")}</option>
            {Constants.public.Enums.customer_source.map((s) => <option key={s} value={s}>{cs(s)}</option>)}
          </Select>
        </Field>
        <Field id="preferred_language" label={t("language")} error={errors.preferred_language}>
          <Select {...fieldAria("preferred_language", errors.preferred_language)} value={values.preferred_language} onChange={set("preferred_language")}>
            <option value="en">{t("languageEn")}</option>
            <option value="es">{t("languageEs")}</option>
          </Select>
        </Field>
      </div>
    </Card>

    <Card className="gap-4 p-6 text-[15px] ring-0 border border-border">
      <h2>{t("address")}</h2>
      <Field id="address_line1" label={t("address1")} error={errors.address_line1}>{input("address_line1", { autoComplete: "address-line1" })}</Field>
      <Field id="address_line2" label={t("address2")} error={errors.address_line2}>{input("address_line2", { autoComplete: "address-line2" })}</Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_100px_140px]">
        <Field id="city" label={t("city")} error={errors.city}>{input("city", { autoComplete: "address-level2" })}</Field>
        <Field id="state" label={t("state")} error={errors.state}>{input("state", { autoComplete: "address-level1", maxLength: 2 })}</Field>
        <Field id="zip" label={t("zip")} error={errors.zip}>{input("zip", { autoComplete: "postal-code", inputMode: "numeric" })}</Field>
      </div>
      <Field id="notes" label={t("notes")} error={errors.notes}>
        <Textarea {...fieldAria("notes", errors.notes)} value={values.notes} onChange={set("notes")} />
      </Field>
    </Card>

    {duplicates && duplicates.length > 0 && <div role="alert" className="rounded-card bg-status-warning-bg p-5 text-status-warning-text">
      <p className="font-semibold">{t("duplicateTitle")}</p>
      <p className="mt-1">{t("duplicateText")}</p>
      <ul className="mt-2">
        {duplicates.map((d) => <li key={d.id}><Link href={`/customers/${d.id}`} className="inline-flex min-h-11 items-center font-semibold text-link underline hover:text-link-hover">{d.name}</Link></li>)}
      </ul>
      <Button type="button" variant="outline" className="mt-2" disabled={pending} onClick={() => submit(true)}>{t("createAnyway")}</Button>
    </div>}

    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending}>{pending ? c("saving") : c("save")}</Button>
      <Button type="button" variant="outline" onClick={() => router.back()}>{c("cancel")}</Button>
    </div>
  </form>;
}
