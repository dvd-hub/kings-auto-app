"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";
import { Constants } from "@/lib/database.types";
import { formatMoney, parseMoneyToCents } from "@/lib/format";
import { lineAmount, plainLanguageWarning, type EstimateLine } from "@/lib/orders";
import type { FieldErrors } from "@/lib/validation";
import { saveEstimateLine } from "@/app/(app)/orders/estimate-actions";

type Values = { line_type: string; description: string; quantity: string; unit_price_cents: string; taxable: boolean; part_condition: string; is_crash_part: string; crash_part_origin: string; part_number: string; brand: string; non_returnable: boolean; labor_type: string; paint_materials_method: string; sublet_vendor_name: string; sublet_vendor_address: string; teardown_role: string };
type StringKey = { [K in keyof Values]: Values[K] extends string ? K : never }[keyof Values];

export function LineEditor({ orderId, estimateId, kind, line, epaAvailable, onClose }: { orderId: string; estimateId: string; kind: "teardown" | "repair"; line: EstimateLine | null; epaAvailable: boolean; onClose: () => void }) {
  const t = useTranslations();
  const [values, setValues] = useState<Values>({ line_type: line?.line_type ?? "part", description: line?.description ?? "", quantity: line ? String(line.quantity) : "1", unit_price_cents: line ? formatMoney(line.unit_price_cents) : "", taxable: line?.taxable ?? false, part_condition: line?.part_condition ?? "", is_crash_part: line?.is_crash_part === null || !line ? "" : String(line.is_crash_part), crash_part_origin: line?.crash_part_origin ?? "", part_number: line?.part_number ?? "", brand: line?.brand ?? "", non_returnable: line?.non_returnable ?? false, labor_type: line?.labor_type ?? "", paint_materials_method: line?.paint_materials_method ?? "", sublet_vendor_name: line?.sublet_vendor_name ?? "", sublet_vendor_address: line?.sublet_vendor_address ?? "", teardown_role: line?.teardown_role ?? "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const set = (key: StringKey) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const input = (key: StringKey, label: string) => <Field id={key} label={label} error={errors[key]}><Input {...fieldAria(key, errors[key])} value={values[key]} onChange={set(key)} /></Field>;
  const select = (key: StringKey, label: string, enums: readonly string[], namespace: string, optional = false) => <Field id={key} label={label} error={errors[key]}><Select {...fieldAria(key, errors[key])} value={values[key]} onChange={set(key)}><option value="">{t(optional ? "common.none" : "estimates.choose")}</option>{enums.map((v) => <option key={v} value={v}>{t(`${namespace}.${v}`)}</option>)}</Select></Field>;
  const yesNo = (key: "is_crash_part", label: string) => <Field id={key} label={label} error={errors[key]}><Select {...fieldAria(key, errors[key])} value={values[key]} onChange={set(key)}><option value="">{t("estimates.choose")}</option><option value="true">{t("estimates.yes")}</option><option value="false">{t("estimates.no")}</option></Select></Field>;
  const cents = parseMoneyToCents(values.unit_price_cents);
  const preview = cents !== null && /^\d+(?:\.\d{1,2})?$/.test(values.quantity) ? lineAmount(values.quantity, cents) : null;
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}><DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogTitle>{t(line ? "estimates.editLine" : "estimates.addLine")}</DialogTitle><DialogDescription>{t("estimates.lineHelp")}</DialogDescription>
    <form noValidate className="space-y-4" onSubmit={(event) => {
      event.preventDefault(); start(async () => {
        const result = await saveEstimateLine(orderId, estimateId, line?.id ?? null, values);
        if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(t(`errors.${result.error}`)); return; }
        toast.success(t("estimates.lineSaved")); onClose();
      });
    }}>
      <Field id="line_type" label={t("estimates.lineType")} error={errors.line_type}><Select {...fieldAria("line_type", errors.line_type)} value={values.line_type} onChange={(event) => setValues((v) => ({ ...v, line_type: event.target.value, teardown_role: "" }))}>
        {Constants.public.Enums.estimate_line_type.map((v) => <option key={v} value={v} disabled={v === "hazardous_waste" && !epaAvailable}>{t(`estimate_line_type.${v}`)}</option>)}
      </Select></Field>
      {!epaAvailable && <p className="text-sm text-secondary-foreground">{t("estimates.epaHint")}</p>}
      <Field id="description" label={t("estimates.description")} error={errors.description} warning={plainLanguageWarning.test(values.description) ? t("estimates.plainLanguage") : undefined}><Textarea {...fieldAria("description", errors.description)} value={values.description} onChange={set("description")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="quantity" label={t(values.line_type === "labor" ? "estimates.hours" : "estimates.quantity")} error={errors.quantity}><Input {...fieldAria("quantity", errors.quantity)} value={values.quantity} onChange={set("quantity")} inputMode="decimal" /></Field>
        <Field id="unit_price_cents" label={t("estimates.unitPrice")} error={errors.unit_price_cents}><Input {...fieldAria("unit_price_cents", errors.unit_price_cents)} value={values.unit_price_cents} onChange={set("unit_price_cents")} inputMode="decimal" /></Field>
      </div>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5 accent-primary" checked={values.taxable} onChange={(e) => setValues((v) => ({ ...v, taxable: e.target.checked }))} />{t("estimates.taxable")}</label>
      {values.line_type === "part" && <div className="space-y-4">
        {select("part_condition", t("estimates.partCondition"), Constants.public.Enums.part_condition, "part_condition")}
        {yesNo("is_crash_part", t("estimates.crashPart"))}
        {values.is_crash_part === "true" && select("crash_part_origin", t("estimates.crashOrigin"), Constants.public.Enums.crash_part_origin, "crash_part_origin")}
        <div className="grid gap-4 sm:grid-cols-2">{input("part_number", `${t("estimates.partNumber")} · ${t("common.optional")}`)}{input("brand", `${t("estimates.brand")} · ${t("common.optional")}`)}</div>
        <Field id="non_returnable" label={t("estimates.nonReturnable")} hint={t("estimates.nonReturnableHint")}><Select id="non_returnable" value={String(values.non_returnable)} onChange={(e) => setValues((v) => ({ ...v, non_returnable: e.target.value === "true" }))}><option value="false">{t("estimates.no")}</option><option value="true">{t("estimates.yes")}</option></Select></Field>
      </div>}
      {values.line_type === "labor" && select("labor_type", t("estimates.laborType"), Constants.public.Enums.labor_type, "labor_type")}
      {values.line_type === "paint_materials" && select("paint_materials_method", t("estimates.paintMethod"), Constants.public.Enums.paint_materials_method, "paint_materials_method")}
      {values.line_type === "sublet" && <div className="space-y-4">{input("sublet_vendor_name", t("estimates.vendorName"))}{input("sublet_vendor_address", `${t("estimates.vendorAddress")} · ${t("common.optional")}`)}</div>}
      {kind === "teardown" && (values.line_type === "labor" || ["part", "materials"].includes(values.line_type)) && select("teardown_role", t("estimates.teardownRole"), values.line_type === "labor" ? ["teardown", "reassembly"] : ["destroyed_item"], "teardown_role", true)}
      <p className="font-mono font-semibold">{t("estimates.lineAmount")}: {preview !== null && Number.isSafeInteger(preview) ? formatMoney(preview) : t("common.none")}</p>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t("common.cancel")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
