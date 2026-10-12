"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SHOP_TIMEZONE } from "@/lib/config";
import { Constants } from "@/lib/database.types";
import { formatMoney, formatPaymentNumber, parseMoneyToCents } from "@/lib/format";
import { fieldErrors, paymentSchema, paymentVoidSchema, type FieldErrors } from "@/lib/validation";
import type { Payment, RoBalance } from "@/lib/payments";
import { recordPayment, voidPayment } from "@/app/(app)/orders/payment-actions";

type Kind = Payment["kind"];

function PaymentDialog({ orderId, kind, balance, payerName, claimNumber, onClose }: {
  orderId: string; kind: Kind; balance: RoBalance; payerName: string; claimNumber: string; onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const prefix = useId();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [confirmed, setConfirmed] = useState(false);
  const [serverOverpayment, setServerOverpayment] = useState<number | null>(null);
  const [values, setValues] = useState({
    amount_cents: "", paid_at: formatInTimeZone(new Date(), SHOP_TIMEZONE, "yyyy-MM-dd"),
    method: "cash" as Payment["method"], payer: "customer" as Payment["payer"],
    payer_name: "", claim_number: "", reference: "", notes: "",
  });
  const cents = parseMoneyToCents(values.amount_cents);
  const overpayment = kind === "payment" ? serverOverpayment ?? (cents !== null && balance.balance_cents !== null ? Math.max(0, cents - balance.balance_cents) : 0) : 0;
  const maxRefund = balance.net_paid_cents ?? 0;
  const refundExceeded = kind === "refund" && cents !== null && cents > maxRefund;
  function change<K extends keyof typeof values>(key: K, value: typeof values[K]) {
    setValues(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: "" }));
    setError(undefined);
    if (key === "amount_cents") { setConfirmed(false); setServerOverpayment(null); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogTitle>{t(kind === "payment" ? "payments.recordPayment" : "payments.recordRefund")}</DialogTitle>
      <DialogDescription>{t(kind === "payment" ? "payments.paymentHelp" : "payments.refundHelp")}</DialogDescription>
      <form noValidate onSubmit={event => {
        event.preventDefault();
        const input = { ...values, orderId, kind, confirmedOverpaymentCents: confirmed ? overpayment : null };
        const parsed = paymentSchema.safeParse(input);
        if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
        if (refundExceeded) { setError("paymentRefundExceeded"); return; }
        if (overpayment > 0 && !confirmed) { setError("paymentOverpaymentConfirmation"); return; }
        setError(undefined); setErrors({});
        start(async () => {
          try {
            const result = await recordPayment(input);
            if (!result.ok) {
              if ("overpaymentCents" in result) { setServerOverpayment(result.overpaymentCents); setConfirmed(false); }
              if ("fieldErrors" in result) setErrors(result.fieldErrors ?? {});
              setError(result.error);
              return;
            }
            onClose(); router.refresh();
          } catch { setError("save"); }
        });
      }} className="space-y-4">
        <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field id={`${prefix}-amount`} label={t("payments.amount")} error={errors.amount_cents} hint={kind === "refund" ? t("payments.refundMaximum", { amount: formatMoney(maxRefund) }) : undefined}>
            <Input {...fieldAria(`${prefix}-amount`, errors.amount_cents)} inputMode="decimal" value={values.amount_cents} onChange={e => change("amount_cents", e.target.value)} aria-describedby={errors.amount_cents ? `${prefix}-amount-error` : kind === "refund" ? `${prefix}-amount-hint` : undefined} />
          </Field>
          <Field id={`${prefix}-date`} label={t("payments.date")} error={errors.paid_at} hint={t("payments.dateHelp")}>
            <Input {...fieldAria(`${prefix}-date`, errors.paid_at)} type="date" max={formatInTimeZone(new Date(), SHOP_TIMEZONE, "yyyy-MM-dd")} value={values.paid_at} onChange={e => change("paid_at", e.target.value)} aria-describedby={errors.paid_at ? `${prefix}-date-error` : `${prefix}-date-hint`} />
          </Field>
          <Field id={`${prefix}-method`} label={t("payments.methodLabel")} error={errors.method}>
            <Select {...fieldAria(`${prefix}-method`, errors.method)} value={values.method} onChange={e => change("method", e.target.value as Payment["method"])}>{Constants.public.Enums.payment_method.map(method => <option key={method} value={method}>{t(`payments.method.${method}`)}</option>)}</Select>
          </Field>
          <Field id={`${prefix}-payer`} label={t("payments.payerLabel")} error={errors.payer}>
            <Select {...fieldAria(`${prefix}-payer`, errors.payer)} value={values.payer} onChange={e => {
              const payer = e.target.value as Payment["payer"];
              change("payer", payer);
              change("payer_name", payer === "insurance" ? payerName : "");
              change("claim_number", payer === "insurance" ? claimNumber : "");
            }}>{Constants.public.Enums.payment_payer.map(payer => <option key={payer} value={payer}>{t(`payments.payer.${payer}`)}</option>)}</Select>
          </Field>
          <Field id={`${prefix}-name`} label={t(values.payer === "insurance" ? "payments.payerNameRequired" : "payments.payerName")} error={errors.payer_name}>
            <Input {...fieldAria(`${prefix}-name`, errors.payer_name)} required={values.payer === "insurance"} maxLength={120} value={values.payer_name} onChange={e => change("payer_name", e.target.value)} />
          </Field>
          <Field id={`${prefix}-claim`} label={t("payments.claimNumber")} error={errors.claim_number}>
            <Input {...fieldAria(`${prefix}-claim`, errors.claim_number)} maxLength={60} value={values.claim_number} onChange={e => change("claim_number", e.target.value)} />
          </Field>
          <Field id={`${prefix}-reference`} className="sm:col-span-2" label={t("payments.reference")} error={errors.reference} hint={t("payments.referenceHelp")}>
            <Input {...fieldAria(`${prefix}-reference`, errors.reference)} maxLength={40} value={values.reference} onChange={e => change("reference", e.target.value)} aria-describedby={errors.reference ? `${prefix}-reference-error` : `${prefix}-reference-hint`} />
          </Field>
          <Field id={`${prefix}-notes`} className="sm:col-span-2" label={t("payments.notes")} error={errors.notes}>
            <Textarea {...fieldAria(`${prefix}-notes`, errors.notes)} maxLength={1000} value={values.notes} onChange={e => change("notes", e.target.value)} />
          </Field>
        </fieldset>
        {overpayment > 0 && <div className="space-y-2 rounded-control bg-status-warning-bg p-3 text-status-warning-text">
          <p role="status">{t("payments.overpaymentWarning", { amount: formatMoney(overpayment) })}</p>
          <label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" className="size-5 accent-primary" disabled={pending} checked={confirmed} onChange={e => { setConfirmed(e.target.checked); setError(undefined); }} />{t("payments.confirmOverpayment")}</label>
        </div>}
        {refundExceeded && <p role="alert" className="text-status-danger-text">{t("errors.paymentRefundExceeded")}</p>}
        {error && <p role="alert" className="text-status-danger-text">{t(`errors.${error}`)}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={pending || refundExceeded || (overpayment > 0 && !confirmed)}>{t(pending ? "common.saving" : kind === "payment" ? "payments.recordPayment" : "payments.recordRefund")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function PaymentButtons({ orderId, cancelled, balance, payerName, claimNumber }: {
  orderId: string; cancelled: boolean; balance: RoBalance; payerName: string; claimNumber: string;
}) {
  const t = useTranslations();
  const [kind, setKind] = useState<Kind | null>(null);
  return <>
    <div className="flex flex-wrap gap-2">{!cancelled && <Button onClick={() => setKind("payment")}>{t("payments.recordPayment")}</Button>}{(balance.net_paid_cents ?? 0) > 0 && <Button variant="outline" onClick={() => setKind("refund")}>{t("payments.recordRefund")}</Button>}</div>
    {kind && <PaymentDialog orderId={orderId} kind={kind} balance={balance} payerName={payerName} claimNumber={claimNumber} onClose={() => setKind(null)} />}
  </>;
}

export function VoidPaymentButton({ orderId, payment }: { orderId: string; payment: Payment }) {
  const t = useTranslations();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  return <>
    <Button variant="outline" onClick={() => { setOpen(true); setReason(""); setErrors({}); setError(undefined); }}>{t("payments.void")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}><DialogContent showCloseButton={false}>
      <DialogTitle>{t("payments.voidTitle", { number: formatPaymentNumber(payment.payment_number) })}</DialogTitle>
      <DialogDescription>{t("payments.voidHelp")}</DialogDescription>
      <form noValidate className="space-y-4" onSubmit={event => {
        event.preventDefault();
        const input = { orderId, paymentId: payment.id, reason };
        const parsed = paymentVoidSchema.safeParse(input);
        if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
        setError(undefined); setErrors({});
        start(async () => {
          try {
            const result = await voidPayment(input);
            if (!result.ok) { if ("fieldErrors" in result) setErrors(result.fieldErrors ?? {}); setError(result.error); return; }
            setOpen(false); router.refresh();
          } catch { setError("save"); }
        });
      }}>
        <Field id={id} label={t("payments.voidReason")} error={errors.reason}><Textarea {...fieldAria(id, errors.reason)} disabled={pending} value={reason} maxLength={2000} onChange={event => { setReason(event.target.value); setErrors({}); }} /></Field>
        {error && <p role="alert" className="text-status-danger-text">{t(`errors.${error}`)}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button type="submit" variant="destructive" disabled={pending}>{t(pending ? "common.saving" : "payments.void")}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </>;
}
