"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field, Select, fieldAria } from "@/components/form-field";
import { LineEditor } from "@/components/orders/line-editor";
import { DocumentUpload } from "@/components/orders/document-upload";
import { EstimateAuthorization } from "@/components/orders/estimate-authorization";
import type { SupplementContext } from "@/lib/supplements";
import type { RepairOrder } from "@/lib/orders";
import { createEstimate } from "@/app/(app)/orders/estimate-actions";
import { notifyPayor } from "@/app/(app)/orders/phase3b2-actions";
import type { SignedDocument, Authorization } from "@/lib/document-shared";
import { attachPayorDocument } from "@/app/(app)/orders/document-actions";
import { estimateEditable, estimateStatusVariants, type Estimate, type EstimateLine, type EstimateTotals, type OrderResult } from "@/lib/orders";
import { formatMoney, formatDateTime, formatRoNumber, parseMoneyToCents } from "@/lib/format";
import type { FieldErrors } from "@/lib/validation";
import { saveEstimateDetails, changeEstimateStatus, changeEstimateLine } from "@/app/(app)/orders/estimate-actions";

type Values = { basis: string; teardown_area: string; teardown_may_prevent_restoration: string; reassembly_max_days: string; pickup_deadline_days: string; payor_name: string; payor_claim_number: string; payor_estimate_total_cents: string; payor_approved_amount_cents: string };

export function EstimateBuilder({ supplement, estimate, lines, totals, order, customer, epaAvailable, payorDocument, authorization, signature, proofs }: { supplement: SupplementContext | null; estimate: Estimate; lines: EstimateLine[]; totals: EstimateTotals | null; order: RepairOrder; customer: { id: string; name: string; phone: string | null; email: string | null }; epaAvailable: boolean; payorDocument: SignedDocument | null; authorization: Authorization | null; signature: SignedDocument | null; proofs: SignedDocument[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const editable = estimateEditable(estimate);
  const [values, setValues] = useState<Values>({ basis: estimate.basis, teardown_area: estimate.teardown_area ?? "", teardown_may_prevent_restoration: estimate.teardown_may_prevent_restoration === null ? "" : String(estimate.teardown_may_prevent_restoration), reassembly_max_days: estimate.reassembly_max_days?.toString() ?? "", pickup_deadline_days: estimate.pickup_deadline_days?.toString() ?? "", payor_name: estimate.payor_name ?? "", payor_claim_number: estimate.payor_claim_number ?? "", payor_estimate_total_cents: estimate.payor_estimate_total_cents === null ? "" : formatMoney(estimate.payor_estimate_total_cents), payor_approved_amount_cents: estimate.payor_approved_amount_cents === null ? "" : formatMoney(estimate.payor_approved_amount_cents) });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [editor, setEditor] = useState<EstimateLine | "new" | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [pending, start] = useTransition();
  const blockedThirdParty = values.basis === "third_party" && !estimate.payor_estimate_document_id;
  const missingRoles = estimate.kind === "teardown" && (!lines.some((l) => l.teardown_role === "teardown") || !lines.some((l) => l.teardown_role === "reassembly"));
  const legal = Boolean(values.payor_name.trim()) && parseMoneyToCents(values.payor_approved_amount_cents) === null;
  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const input = (key: keyof Values, label: string, hint?: string, money = false) => <Field id={key} label={label} error={errors[key]} hint={hint}><Input {...fieldAria(key, errors[key])} value={values[key]} disabled={!editable || pending} onChange={set(key)} inputMode={money ? "decimal" : key.endsWith("days") ? "numeric" : undefined} /></Field>;
  function handle(result: OrderResult, message: string) {
    if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(t(`errors.${result.error}`)); return false; }
    setErrors({});
    if (result.warning) toast.warning(t(`errors.${result.warning}`)); else toast.success(message);
    return true;
  }
  function command(value: "sent" | "draft" | "voided") {
    start(async () => { if (handle(await changeEstimateStatus({ orderId: order.id, estimateId: estimate.id, command: value }, values), t("estimates.statusSaved"))) setVoidOpen(false); });
  }
  function changeLine(lineId: string, value: "up" | "down" | "remove") {
    start(async () => { handle(await changeEstimateLine({ orderId: order.id, estimateId: estimate.id, lineId, command: value }), t("estimates.lineSaved")); });
  }
  return <section className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className={estimate.status === "voided" ? "line-through" : ""}>{supplement ? t("phase3b2.supplementTitle", { seq: estimate.seq, kind: t(`estimate_kind.${supplement.parent.kind}`), parent: supplement.parent.seq }) : <>{t(`estimate_kind.${estimate.kind}`)} {estimate.seq}</>}</h1><div className="mt-2 flex flex-wrap items-center gap-3"><StatusBadge variant={estimateStatusVariants[estimate.status]} label={t(`estimate_status.${estimate.status}`)} /><Link href={`/orders/${order.id}`} className="inline-flex min-h-11 items-center font-mono text-link underline">{formatRoNumber(order.ro_number)}</Link><Link href={`/customers/${customer.id}`} className="inline-flex min-h-11 items-center text-link underline">{customer.name}</Link></div></div>
      {estimate.status === "authorized" && ["repair", "supplement"].includes(estimate.kind) && !["cancelled", "delivered", "total_loss"].includes(order.status) && <Button variant="outline" disabled={pending} onClick={() => start(async () => { const result = await createEstimate({ orderId: order.id, kind: "supplement", parentEstimateId: estimate.id }); if (!result.ok) handle(result, ""); })}>{t("phase3b2.newSupplement")}</Button>}
      {editable && <div className="flex flex-wrap gap-2">{estimate.status === "draft" ? <Button disabled={pending || blockedThirdParty} onClick={() => command("sent")}>{t("estimates.markSent")}</Button> : <Button variant="outline" disabled={pending} onClick={() => command("draft")}>{t("estimates.backDraft")}</Button>}<Button variant="outline" disabled={pending} onClick={() => setVoidOpen(true)}>{t("estimates.void")}</Button></div>}
    </div>
    {supplement && <div className="grid gap-3 rounded-card border border-border bg-surface p-5 sm:grid-cols-3">{[["authorizedBefore", supplement.authorizedBefore], ["supplementAmount", totals?.total_cents ?? 0], ["revisedTotal", supplement.authorizedBefore + (totals?.total_cents ?? 0)]].map(([key, amount]) => <div key={key}><p>{t(`phase3b2.${key}`)}</p><p className="font-mono font-semibold">{formatMoney(Number(amount))}</p></div>)}</div>}
    {estimate.kind === "supplement" && estimate.status === "authorized" && estimate.payor_name && <div className="space-y-2 rounded-control bg-status-warning-bg p-4 text-status-warning-text">{estimate.payor_notified_at ? <p>{t("phase3b2.payorNotifiedAt", { when: formatDateTime(estimate.payor_notified_at) })}</p> : <><p>{t("phase3b2.notifyPayor")}</p><Button variant="outline" disabled={pending} onClick={() => start(async () => { handle(await notifyPayor({ orderId: order.id, estimateId: estimate.id }), t("phase3b2.saved")); })}>{t("phase3b2.payorNotified")}</Button></>}</div>}
    {!editable && <p className="rounded-control bg-status-warning-bg p-4 text-status-warning-text">{t("estimates.locked")}</p>}
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
      <div className="min-w-0 space-y-6">
        <form noValidate className="space-y-6" onSubmit={(event) => { event.preventDefault(); start(async () => { handle(await saveEstimateDetails(order.id, estimate.id, values), t("estimates.saved")); }); }}>
          {estimate.kind === "teardown" && <div className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("estimates.teardownDetails")}</h2>
            {input("teardown_area", t("estimates.teardownArea"), t("estimates.teardownAreaHint"))}
            <Field id="teardown_may_prevent_restoration" label={t("estimates.preventRestoration")} error={errors.teardown_may_prevent_restoration}><Select {...fieldAria("teardown_may_prevent_restoration", errors.teardown_may_prevent_restoration)} value={values.teardown_may_prevent_restoration} onChange={set("teardown_may_prevent_restoration")} disabled={!editable || pending}><option value="">{t("estimates.choose")}</option><option value="true">{t("estimates.yes")}</option><option value="false">{t("estimates.no")}</option></Select></Field>
            <div className="grid gap-4 sm:grid-cols-2">{input("reassembly_max_days", t("estimates.reassemblyDays"), t("estimates.reassemblyHint"))}{input("pickup_deadline_days", `${t("estimates.pickupDays")} · ${t("common.optional")}`, t("estimates.pickupHint"))}</div>
          </div>}
          <div className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("estimates.payor")}</h2>
            <Field id="basis" label={t("estimates.basis")} error={errors.basis}><Select {...fieldAria("basis", errors.basis)} value={values.basis} onChange={set("basis")} disabled={!editable || pending}><option value="shop">{t("estimate_basis.shop")}</option><option value="third_party">{t("estimate_basis.third_party")}</option></Select></Field>
            <div className="grid gap-4 sm:grid-cols-2">{input("payor_name", t("estimates.payorName"))}{input("payor_claim_number", t("estimates.claimNumber"))}{input("payor_estimate_total_cents", t("estimates.payorTotal"), undefined, true)}{input("payor_approved_amount_cents", `${t("estimates.payorApproved")} · ${t("common.optional")}`, t("estimates.ifKnown"), true)}</div>
            {values.basis === "third_party" && <div className="space-y-2">{payorDocument?.url && <a className="inline-flex min-h-11 items-center break-all text-link underline" href={payorDocument.url} target="_blank" rel="noopener noreferrer">{t("documents.openFile")} · {payorDocument.caption}</a>}{editable && <DocumentUpload shopId={order.shop_id} orderId={order.id} estimateId={estimate.id} kind="third_party_estimate" label={t(payorDocument ? "documents.changeInsurer" : "documents.attachInsurer")} disabled={pending} onUploaded={async (documentId) => { const saved = await saveEstimateDetails(order.id, estimate.id, values); if (!saved.ok) { setErrors(saved.fieldErrors ?? {}); return saved; } return attachPayorDocument({ orderId: order.id, estimateId: estimate.id, documentId }); }} />}{blockedThirdParty && <p role="status" className="text-status-warning-text">{t("errors.payorDocumentRequired")}</p>}</div>}
            {editable && <Button type="submit" variant="outline" disabled={pending}>{pending ? t("common.saving") : t("estimates.saveDetails")}</Button>}
          </div>
        </form>
        <div className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h2>{t("estimates.lines")}</h2>{editable && <Button variant="outline" disabled={pending} onClick={() => setEditor("new")}>{t("estimates.addLine")}</Button>}</div>
          {missingRoles && <p className="rounded-control bg-status-warning-bg p-3 text-status-warning-text">{t("estimates.missingRoles")}</p>}
          {!lines.length && <p className="text-secondary-foreground">{t("estimates.noLines")}</p>}
          <ol className="space-y-3">{lines.map((line, index) => <li key={line.id} data-testid={`line-${line.id}`} className="min-w-0 space-y-3 rounded-control border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><StatusBadge variant="neutral" label={t(`estimate_line_type.${line.line_type}`)} /><p className="mt-2 whitespace-pre-wrap break-words font-semibold">{line.description}</p></div><span className="font-mono font-semibold">{formatMoney(line.amount_cents ?? 0)}</span></div>
            <p className="text-sm text-secondary-foreground">{t(line.line_type === "labor" ? "estimates.hours" : "estimates.quantity")}: {line.quantity} · {t("estimates.unitPrice")}: {formatMoney(line.unit_price_cents)} · {t(line.taxable ? "estimates.taxable" : "estimates.notTaxable")}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">{line.part_condition && <span>{t("estimates.partCondition")}: {t(`part_condition.${line.part_condition}`)}</span>}{line.line_type === "part" && <span>{t("estimates.crashPart")}: {t(line.is_crash_part ? "estimates.yes" : "estimates.no")}</span>}{line.crash_part_origin && <span>{t(`crash_part_origin.${line.crash_part_origin}`)}</span>}{line.part_number && <span>{t("estimates.partNumber")}: {line.part_number}</span>}{line.brand && <span>{t("estimates.brand")}: {line.brand}</span>}{line.line_type === "part" && <span>{t("estimates.nonReturnable")}: {t(line.non_returnable ? "estimates.yes" : "estimates.no")}</span>}{line.labor_type && <span>{t(`labor_type.${line.labor_type}`)}</span>}{line.paint_materials_method && <span>{t(`paint_materials_method.${line.paint_materials_method}`)}</span>}{line.sublet_vendor_name && <span>{t("estimates.vendorName")}: {line.sublet_vendor_name}</span>}{line.sublet_vendor_address && <span>{t("estimates.vendorAddress")}: {line.sublet_vendor_address}</span>}{line.teardown_role && <span className="font-semibold">{t(`teardown_role.${line.teardown_role}`)}</span>}</div>
            {editable && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => setEditor(line)}>{t("common.edit")}</Button><Button variant="outline" className="min-h-11 min-w-11 px-3" aria-label={t("estimates.moveUp", { description: line.description })} disabled={pending || index === 0} onClick={() => changeLine(line.id, "up")}><ArrowUp className="size-4" /></Button><Button variant="outline" className="min-h-11 min-w-11 px-3" aria-label={t("estimates.moveDown", { description: line.description })} disabled={pending || index === lines.length - 1} onClick={() => changeLine(line.id, "down")}><ArrowDown className="size-4" /></Button><Button variant="outline" disabled={pending} onClick={() => changeLine(line.id, "remove")}>{t("estimates.remove")}</Button></div>}
          </li>)}</ol>
        </div>
        <EstimateAuthorization supplement={supplement} estimate={estimate} totals={totals} order={order} customer={customer} authorization={authorization} signature={signature} proofs={proofs} />
      </div>
      <aside className="min-w-0 space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6 xl:sticky xl:top-24"><h2>{t("estimates.summary")}</h2><dl className="space-y-3">{(["parts_cents", "labor_cents", "materials_cents", "sublet_cents", "hazardous_waste_cents", "total_cents"] as const).map((key) => <div key={key} className={`flex flex-wrap justify-between gap-2 ${key === "total_cents" ? "border-t border-border pt-4 text-lg font-semibold" : ""}`}><dt>{t(`estimates.totals.${key}`)}</dt><dd className="font-mono">{formatMoney(totals?.[key] ?? 0)}</dd></div>)}</dl>
        <p className="text-sm text-secondary-foreground">{t("estimates.salesTax")}</p>
        {legal && <div className="space-y-3 border-t border-border pt-4 text-sm"><p lang="en">{t("estimates.payorLegal")}</p>{locale === "es" && <><p className="font-semibold">{t("estimates.informationalTranslation")}</p><p>{t("estimates.payorLegalTranslation")}</p></>}</div>}
      </aside>
    </div>
    {editor && editable && <LineEditor key={editor === "new" ? "new" : editor.id} orderId={order.id} estimateId={estimate.id} kind={estimate.kind} line={editor === "new" ? null : editor} epaAvailable={epaAvailable} onClose={() => setEditor(null)} />}
    <Dialog open={voidOpen} onOpenChange={setVoidOpen}><DialogContent showCloseButton={false}><DialogTitle>{t("estimates.voidTitle")}</DialogTitle><DialogDescription>{t("estimates.voidText")}</DialogDescription><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setVoidOpen(false)}>{t("common.cancel")}</Button><Button variant="destructive" disabled={pending} onClick={() => command("voided")}>{t("estimates.confirmVoid")}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
