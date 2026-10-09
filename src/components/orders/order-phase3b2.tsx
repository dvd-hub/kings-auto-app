"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { toast } from "sonner";
import type { RepairOrder, OrderResult } from "@/lib/orders";
import { SHOP_TIMEZONE } from "@/lib/config";
import { formatDateTime, formatPhone, formatRoNumber } from "@/lib/format";
import { designatePerson, recordOrderCommand, recordTeardownOutcome } from "@/app/(app)/orders/phase3b2-actions";
import { SignatureCanvas } from "./signature-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldAria } from "@/components/form-field";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function OrderPhase3b2({ order, teardownAuthorized, repairAuthorized, reassemblyDeadline }: { order: RepairOrder; teardownAuthorized: boolean; repairAuthorized: boolean; reassemblyDeadline: string | null }) {
  const t = useTranslations(), locale = useLocale(), router = useRouter();
  const [designating, setDesignating] = useState(false), [confirm, setConfirm] = useState<"total_loss" | "repair" | "reassemble" | "declined_reassembly" | null>(null), [pending, start] = useTransition();
  const [values, setValues] = useState({ designee_name: "", designee_phone: "", designee_email: "", designee_signed_at: "", signature: "", confirmed: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  function handle(result: OrderResult) {
    if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(t(`errors.${result.error}`)); return; }
    if (result.warning) toast.warning(t(`errors.${result.warning}`)); else toast.success(t("phase3b2.saved"));
    setDesignating(false); setConfirm(null); setErrors({}); router.refresh();
  }
  const field = (key: "designee_name" | "designee_phone" | "designee_email" | "designee_signed_at", label: string, type = "text") => <Field id={key} label={t(`phase3b2.${label}`)} error={errors[key]}><Input {...fieldAria(key, errors[key])} type={type} disabled={pending} value={values[key]} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} /></Field>;
  const signingDate = fromZonedTime(values.designee_signed_at, SHOP_TIMEZONE);
  return <>
    <div className="space-y-3 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("phase3b2.designation")}</h2>
      {order.designee_signed_at ? <><p className="font-semibold">{order.designee_name}</p>{order.designee_phone && <p>{formatPhone(order.designee_phone)}</p>}{order.designee_email && <p>{order.designee_email}</p>}<p>{t("phase3b2.designationSignedAt", { when: formatDateTime(order.designee_signed_at) })}</p><Button asChild variant="outline"><a href={`/orders/${order.id}/designation/pdf`} target="_blank" rel="noopener noreferrer">{t("phase3b2.designationCopy")}</a></Button></> : <><p>{t("phase3b2.noDesignee")}</p><Button variant="outline" onClick={() => { setValues({ designee_name: "", designee_phone: "", designee_email: "", designee_signed_at: formatInTimeZone(new Date(), SHOP_TIMEZONE, "yyyy-MM-dd'T'HH:mm"), signature: "", confirmed: false }); setErrors({}); setDesignating(true); }}>{t("phase3b2.designate")}</Button></>}
    </div>
    {teardownAuthorized && <div className="space-y-3 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("phase3b2.teardownTitle")}</h2>{order.teardown_outcome ? <><p className="font-semibold">{t(`teardown_outcome.${order.teardown_outcome}`)}</p>{order.teardown_outcome_at && <p>{t("phase3b2.teardownRecordedAt", { when: formatDateTime(order.teardown_outcome_at) })}</p>}</> : <div className="flex flex-wrap gap-2">{(["repair", "reassemble", "declined_reassembly"] as const).map(outcome => <Button key={outcome} variant="outline" disabled={pending || (outcome === "repair" && !repairAuthorized)} onClick={() => setConfirm(outcome)}>{t(`teardown_outcome.${outcome}`)}</Button>)}</div>}{reassemblyDeadline && (!order.teardown_outcome || order.teardown_outcome === "reassemble") && <p>{t("phase3b2.reassemblyDeadline", { when: formatDateTime(reassemblyDeadline) })}</p>}</div>}
    {(["open", "in_progress", "total_loss", "completed"].includes(order.status)) && <div className="space-y-3 rounded-card border border-border bg-surface p-5 sm:p-6">
      {["open", "in_progress"].includes(order.status) && <Button variant="outline" disabled={pending} onClick={() => setConfirm("total_loss")}>{t("phase3b2.totalLoss")}</Button>}
      {order.total_loss_at && <p>{t("phase3b2.totalLossAt", { when: formatDateTime(order.total_loss_at) })}</p>}
      {["total_loss", "completed"].includes(order.status) && (order.ready_for_pickup_notified_at ? <p>{t("phase3b2.pickupNotifiedAt", { when: formatDateTime(order.ready_for_pickup_notified_at) })}</p> : <Button variant="outline" disabled={pending} onClick={() => start(async () => handle(await recordOrderCommand({ orderId: order.id, command: "pickup_notified" })))}>{t("phase3b2.pickupNotify")}</Button>)}
    </div>}
    <Dialog open={designating} onOpenChange={open => { if (!pending) setDesignating(open); }}><DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogTitle lang="en">{t("phase3b2.designationTitle")}</DialogTitle><DialogDescription lang="en">{t("phase3b2.designationText")}</DialogDescription>{locale === "es" && <div className="text-sm text-secondary-foreground"><p>{t("phase3b2.designationTitleInfo")}</p><p>{t("phase3b2.designationTextInfo")}</p></div>}
      <p className="font-mono">{formatRoNumber(order.ro_number)}</p><form noValidate className="space-y-4" onSubmit={e => { e.preventDefault(); start(async () => handle(await designatePerson({ orderId: order.id, ...values }))); }}>
        {field("designee_name", "designeeName")}{field("designee_phone", "designeePhone", "tel")}{field("designee_email", "designeeEmail", "email")}{field("designee_signed_at", "designationDate", "datetime-local")}{Number.isFinite(signingDate.getTime()) && <p className="text-sm text-secondary-foreground">{formatDateTime(signingDate)}</p>}
        <Field id="signature" label={t("phase3b2.customerSignature")} error={errors.signature}><SignatureCanvas disabled={pending} onChange={signature => setValues(v => ({ ...v, signature }))} /></Field>
        <Field id="confirmed" label={t("phase3b2.designationConfirmation")} error={errors.confirmed}><label className="flex min-h-11 items-center gap-3"><input id="confirmed" type="checkbox" className="size-5 accent-primary" disabled={pending} checked={values.confirmed} onChange={e => setValues(v => ({ ...v, confirmed: e.target.checked }))} />{t("phase3b2.confirm")}</label></Field>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => setDesignating(false)}>{t("common.cancel")}</Button></div>
      </form>
    </DialogContent></Dialog>
    <Dialog open={confirm !== null} onOpenChange={open => { if (!open && !pending) setConfirm(null); }}><DialogContent showCloseButton={false}><DialogTitle>{t(confirm === "total_loss" ? "phase3b2.totalLossConfirm" : "phase3b2.teardownConfirmTitle")}</DialogTitle><DialogDescription>{confirm === "total_loss" ? t("phase3b2.totalLossText") : t("phase3b2.teardownConfirmText", { outcome: confirm ? t(`teardown_outcome.${confirm}`) : "" })}</DialogDescription><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => start(async () => { if (confirm) handle(confirm === "total_loss" ? await recordOrderCommand({ orderId: order.id, command: confirm }) : await recordTeardownOutcome({ orderId: order.id, outcome: confirm })); })}>{t("phase3b2.confirm")}</Button><Button variant="outline" disabled={pending} onClick={() => setConfirm(null)}>{t("common.cancel")}</Button></div></DialogContent></Dialog>
  </>;
}
