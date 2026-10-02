"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Textarea, fieldAria } from "@/components/form-field";
import { decodeVin, saveVehicle } from "@/app/(app)/vehicles/actions";
import { normalizeVin, vinCheckDigitOk } from "@/lib/vin";
import type { FieldErrors, VehicleInput } from "@/lib/validation";

type Values = Required<{ [K in keyof VehicleInput]: string }>;

export function VehicleForm({ vehicleId, customerId, initial }: { vehicleId: string | null; customerId: string; initial: Values }) {
  const t = useTranslations("vehicles");
  const c = useTranslations("common");
  const e = useTranslations("errors");
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [vinOwnerId, setVinOwnerId] = useState<string>();
  const [pending, start] = useTransition();
  const [decoding, startDecode] = useTransition();

  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));
  const input = (key: keyof Values, extra: React.ComponentProps<"input"> = {}) =>
    <Input {...fieldAria(key, errors[key])} value={values[key]} onChange={set(key)} {...extra} />;

  const vin = normalizeVin(values.vin);
  const checkWarning = vin.length === 17 && /^[A-Z0-9]+$/.test(vin) && !vinCheckDigitOk(vin) ? t("checkDigit") : undefined;

  function decode() {
    startDecode(async () => {
      const result = await decodeVin(vin);
      if (!result.ok) { toast.error(t("decodeFailed")); return; }
      setValues((v) => ({
        ...v, vin,
        year: result.year || v.year, make: result.make || v.make, model: result.model || v.model, trim: result.trim || v.trim,
      }));
      toast.success(t("decoded"));
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await saveVehicle(vehicleId, vehicleId ? null : customerId, values);
      if (result.ok) {
        toast.success(t("saved"));
        router.push(`/customers/${result.customerId}`);
        router.refresh();
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setVinOwnerId(result.vinOwnerId);
      if (result.error) toast.error(e(result.error === "notFound" ? "notFound" : "save"));
    });
  }

  return <form noValidate onSubmit={submit} className="space-y-5">
    <Card className="gap-5 p-6 text-[15px] ring-0 border border-border">
      <Field id="vin" label={t("vin")} error={errors.vin} hint={t("vinHint")} warning={checkWarning}>
        <div className="flex flex-wrap gap-2">
          <Input {...fieldAria("vin", errors.vin)} value={values.vin} maxLength={20} autoCapitalize="characters" spellCheck={false}
            onChange={(event) => setValues((v) => ({ ...v, vin: normalizeVin(event.target.value) }))}
            className="min-w-0 flex-1 font-mono uppercase tracking-wide" />
          <Button type="button" variant="outline" disabled={decoding || vin.length < 5} onClick={decode}>{decoding ? t("decoding") : t("decode")}</Button>
        </div>
      </Field>
      {errors.vin === "vinExists" && vinOwnerId && <Link href={`/customers/${vinOwnerId}`}
        className="-mt-3 inline-flex min-h-11 items-center font-semibold text-link underline hover:text-link-hover">{t("viewOwner")}</Link>}

      <div className="grid gap-4 sm:grid-cols-[120px_1fr_1fr]">
        <Field id="year" label={t("year")} error={errors.year}>{input("year", { inputMode: "numeric", maxLength: 4 })}</Field>
        <Field id="make" label={t("make")} error={errors.make}>{input("make")}</Field>
        <Field id="model" label={t("model")} error={errors.model}>{input("model")}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="trim" label={t("trim")} error={errors.trim}>{input("trim")}</Field>
        <Field id="color" label={t("color")} error={errors.color}>{input("color")}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px_1fr]">
        <Field id="plate" label={t("plate")} error={errors.plate}>{input("plate", { className: "uppercase", autoCapitalize: "characters", spellCheck: false })}</Field>
        <Field id="plate_state" label={t("plateState")} error={errors.plate_state}>{input("plate_state", { maxLength: 2, className: "uppercase" })}</Field>
        <Field id="odometer_mi" label={t("odometer")} error={errors.odometer_mi}>{input("odometer_mi", { inputMode: "numeric" })}</Field>
      </div>
      <Field id="notes" label={t("notes")} error={errors.notes}>
        <Textarea {...fieldAria("notes", errors.notes)} value={values.notes} onChange={set("notes")} />
      </Field>
    </Card>
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending}>{pending ? c("saving") : c("save")}</Button>
      <Button type="button" variant="outline" onClick={() => router.back()}>{c("cancel")}</Button>
    </div>
  </form>;
}
