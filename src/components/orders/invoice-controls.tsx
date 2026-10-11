"use client";

import { useState, useTransition, type ReactNode, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Textarea, fieldAria } from "@/components/form-field";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatMoney, formatMiles } from "@/lib/format";
import type { InvoiceLine } from "@/lib/invoices";
import { invoiceIssueSchema, fieldErrors, type FieldErrors } from "@/lib/validation";
import { createInvoiceDraft, saveInvoiceLine, removeInvoiceLine, issueInvoice, discardInvoiceDraft, voidInvoice, freezeInvoicePdf } from "@/app/(app)/orders/invoice-actions";

export function CreateInvoiceButton({ orderId }: { orderId: string }) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => start(async () => {
    const result = await createInvoiceDraft({ orderId });
    if (!result.ok) toast.error(t(`errors.${result.error ?? "save"}`));
  })}>{pending ? t("common.saving") : t("invoices.create")}</Button>;
}

function DraftLine({ orderId, invoiceId, line, pending, start, onDirty }: { orderId: string; invoiceId: string; line: InvoiceLine; pending: boolean; start: TransitionStartFunction; onDirty: (id: string, dirty: boolean) => void }) {
  const t = useTranslations();
  const router = useRouter();
  const initial = { quantity: String(line.quantity), unit_price_cents: formatMoney(line.unit_price_cents), taxable: line.taxable };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [remove, setRemove] = useState(false);
  const dirty = values.quantity !== initial.quantity || values.unit_price_cents !== initial.unit_price_cents || values.taxable !== initial.taxable;
  function change(next: typeof values) {
    setValues(next);
    onDirty(line.id, next.quantity !== initial.quantity || next.unit_price_cents !== initial.unit_price_cents || next.taxable !== initial.taxable);
  }
  const command = { orderId, invoiceId, lineId: line.id, updatedAt: line.updated_at };
  const quantityId = `quantity-${line.id}`, priceId = `price-${line.id}`, formId = `line-${line.id}`;
  return <tr className="border-t border-border align-top">
    <td className="max-w-64 px-3 py-4"><p className="whitespace-pre-wrap break-words font-semibold">{line.description}</p><p className="mt-1 text-sm text-secondary-foreground">{t(`estimate_line_type.${line.line_type}`)}</p></td>
    <td className="min-w-36 px-3 py-4"><Field id={quantityId} label={t("estimates.quantity")} error={errors.quantity} hint={t("invoices.authorized", { value: String(line.authorized_quantity) })}>
      <Input {...fieldAria(quantityId, errors.quantity)} form={formId} inputMode="decimal" value={values.quantity} disabled={pending} onChange={e => change({ ...values, quantity: e.target.value })} />
    </Field></td>
    <td className="min-w-44 px-3 py-4"><Field id={priceId} label={t("estimates.unitPrice")} error={errors.unit_price_cents} hint={t("invoices.authorized", { value: formatMoney(line.authorized_unit_price_cents) })}>
      <Input {...fieldAria(priceId, errors.unit_price_cents)} form={formId} inputMode="decimal" value={values.unit_price_cents} disabled={pending} onChange={e => change({ ...values, unit_price_cents: e.target.value })} />
    </Field></td>
    <td className="whitespace-nowrap px-3 py-4 font-mono">{formatMoney(line.amount_cents ?? 0)}</td>
    <td className="px-3 py-4"><label className="flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" className="size-5 accent-primary" checked={values.taxable} disabled={pending} aria-label={t("invoices.taxableLine", { description: line.description })} onChange={e => change({ ...values, taxable: e.target.checked })} /></label></td>
    <td className="px-3 py-4"><form id={formId} noValidate onSubmit={event => {
      event.preventDefault(); start(async () => {
        const result = await saveInvoiceLine({ ...command, ...values });
        if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(t(`errors.${result.error}`)); return; }
        setErrors({}); onDirty(line.id, false); toast.success(t("invoices.lineSaved")); router.refresh();
      });
    }} className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending || !dirty}>{t("common.save")}</Button><Button type="button" variant="outline" disabled={pending} aria-label={t("invoices.removeLineLabel", { description: line.description })} onClick={() => setRemove(true)}>{t("invoices.removeLine")}</Button></form>
      <Dialog open={remove} onOpenChange={open => { if (!pending) setRemove(open); }}><DialogContent showCloseButton={false}><DialogTitle>{t("invoices.removeLine")}</DialogTitle><DialogDescription>{t("invoices.removeLineConfirm", { description: line.description })}</DialogDescription><DialogFooter>
        <Button variant="outline" disabled={pending} onClick={() => setRemove(false)}>{t("common.cancel")}</Button><Button variant="destructive" disabled={pending} onClick={() => start(async () => {
          const result = await removeInvoiceLine(command);
          if (!result.ok) { toast.error(t(`errors.${result.error ?? "save"}`)); return; }
          onDirty(line.id, false); setRemove(false); toast.success(t("invoices.lineRemoved")); router.refresh();
        })}>{t("invoices.removeLine")}</Button>
      </DialogFooter></DialogContent></Dialog>
    </td>
  </tr>;
}

export function InvoiceDraft({ orderId, invoiceId, lines, odometerIn, odometerOut, children }: { orderId: string; invoiceId: string; lines: InvoiceLine[]; odometerIn: number; odometerOut: number | null; children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [odometer, setOdometer] = useState(odometerOut === null ? "" : String(odometerOut));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dialog, setDialog] = useState<"issue" | "discard" | null>(null);
  const unsaved = lines.some(line => dirty[line.id]);
  const input = { orderId, invoiceId, odometer_out: odometer, notes };
  function confirmIssue() {
    const parsed = invoiceIssueSchema.safeParse(input);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    if (parsed.data.odometer_out < odometerIn) { setErrors({ odometer_out: "odometerOutLow" }); return; }
    setErrors({}); setDialog("issue");
  }
  return <div className="space-y-6">
    <div className="min-w-0 overflow-x-auto rounded-card border border-border bg-surface"><table className="w-full text-left text-sm"><caption className="sr-only">{t("invoices.lines")}</caption>
      <thead className="bg-muted text-secondary-foreground"><tr>{["descriptionType", "quantity", "unitPrice", "amount", "taxable", "actions"].map(key => <th key={key} className="px-3 py-3 font-semibold" scope="col">{t(`invoices.${key}`)}</th>)}</tr></thead>
      <tbody>{lines.map(line => <DraftLine key={`${line.id}:${line.updated_at}`} orderId={orderId} invoiceId={invoiceId} line={line} pending={pending} start={start} onDirty={(id, value) => setDirty(current => ({ ...current, [id]: value }))} />)}</tbody>
    </table>{!lines.length && <p className="p-5 text-secondary-foreground">{t("invoices.noLines")}</p>}</div>
    {children}
    <form noValidate className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6" onSubmit={e => { e.preventDefault(); if (!pending && !unsaved && lines.length) confirmIssue(); }}>
      <h2>{t("invoices.issue")}</h2>
      <Field id="odometer_out" label={t("orders.odometerOut")} error={errors.odometer_out} hint={t("invoices.odometerMinimum", { value: formatMiles(odometerIn) })} className="max-w-sm"><Input {...fieldAria("odometer_out", errors.odometer_out)} type="number" required min={odometerIn} max={2147483647} step="1" inputMode="numeric" value={odometer} disabled={pending} onChange={e => setOdometer(e.target.value)} /></Field>
      <Field id="invoice-notes" label={`${t("orders.notes")} · ${t("common.optional")}`} error={errors.notes}><Textarea {...fieldAria("invoice-notes", errors.notes)} maxLength={2000} value={notes} disabled={pending} onChange={e => setNotes(e.target.value)} /></Field>
      {unsaved && <p role="status" className="text-sm text-status-warning-text">{t("invoices.saveLinesFirst")}</p>}
      <div className="flex flex-wrap gap-3"><Button disabled={pending || unsaved || !lines.length}>{t("invoices.issue")}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => setDialog("discard")}>{t("invoices.discard")}</Button></div>
    </form>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open && !pending) setDialog(null); }}><DialogContent showCloseButton={false}>
      <DialogTitle>{t(dialog === "discard" ? "invoices.discard" : "invoices.issue")}</DialogTitle><DialogDescription>{t(dialog === "discard" ? "invoices.discardConfirm" : "invoices.issueConfirm")}</DialogDescription>
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDialog(null)}>{t("common.cancel")}</Button><Button variant={dialog === "discard" ? "destructive" : "default"} disabled={pending || (dialog === "issue" && unsaved)} onClick={() => start(async () => {
        const result = dialog === "discard" ? await discardInvoiceDraft({ orderId, invoiceId }) : await issueInvoice(input);
        if (!result.ok) { setErrors(result.fieldErrors ?? {}); setDialog(null); if (result.error) toast.error(t(`errors.${result.error}`)); return; }
        setDialog(null); toast.success(t("invoices.issued")); if (result.warning) toast.warning(t(`errors.${result.warning}`)); router.refresh();
      })}>{t(dialog === "discard" ? "invoices.discard" : "invoices.issue")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

export function InvoicePdfRecovery({ orderId, invoiceId }: { orderId: string; invoiceId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return <div className="space-y-3">
    <p role="status" className="rounded-control bg-status-warning-bg p-3 text-status-warning-text">{t("errors.invoicePdfPending")}</p>
    <Button variant="outline" disabled={pending} onClick={() => start(async () => {
      const result = await freezeInvoicePdf({ orderId, invoiceId });
      if (!result.ok) toast.error(t(`errors.${result.error ?? "invoicePdfFailed"}`));
      else { toast.success(t("invoices.pdfSaved")); router.refresh(); }
    })}>{pending ? t("common.saving") : t("invoices.generatePdf")}</Button>
  </div>;
}

export function VoidInvoiceButton({ orderId, invoiceId }: { orderId: string; invoiceId: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  return <><Button variant="outline" onClick={() => setOpen(true)}>{t("invoices.void")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}><DialogContent showCloseButton={false}><DialogTitle>{t("invoices.void")}</DialogTitle><DialogDescription>{t("invoices.voidConfirm")}</DialogDescription>
      <form noValidate className="space-y-4" onSubmit={e => { e.preventDefault(); start(async () => {
        const result = await voidInvoice({ orderId, invoiceId, reason });
        if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(t(`errors.${result.error}`)); }
      }); }}>
        <Field id="void-reason" label={t("invoices.voidReason")} error={errors.reason}><Textarea {...fieldAria("void-reason", errors.reason)} required minLength={3} maxLength={2000} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></Field>
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button variant="destructive" disabled={pending}>{t("invoices.void")}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </>;
}
