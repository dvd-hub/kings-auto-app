"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { toast } from "sonner";
import { SHOP_TIMEZONE } from "@/lib/config";
import { formatDateTime, formatMoney, formatPhone, formatRoNumber } from "@/lib/format";
import type { Authorization, SignedDocument } from "@/lib/document-shared";
import type { SupplementContext } from "@/lib/supplements";
import type { RepairOrder } from "@/lib/orders";
import type { Estimate, EstimateTotals } from "@/lib/orders";
import { authorizeEstimate, freezeEstimatePdf } from "@/app/(app)/orders/estimate-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, fieldAria } from "@/components/form-field";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SignatureCanvas } from "./signature-canvas";
import { DocumentUpload } from "./document-upload";


export function EstimateAuthorization({ supplement, estimate, totals, order, customer, authorization, signature, proofs }: {
  supplement: SupplementContext | null; estimate: Estimate; totals: EstimateTotals | null; order: RepairOrder; customer: { name: string; phone: string | null; email: string | null }; authorization: Authorization | null; signature: SignedDocument | null; proofs: SignedDocument[];
}) {
  const t = useTranslations(), router = useRouter();
  const [decision, setDecision] = useState<"approved" | "declined" | null>(null), [method, setMethod] = useState("written"), [name, setName] = useState(customer.name), [date, setDate] = useState(""), [phone, setPhone] = useState(customer.phone ?? ""), [email, setEmail] = useState(customer.email ?? ""), [contactPhone, setContactPhone] = useState(customer.phone ?? ""), [png, setPng] = useState(""), [parts, setParts] = useState(false), [errors, setErrors] = useState<Record<string, string>>({}), [pending, start] = useTransition();
  const [byDesignee, setByDesignee] = useState(false);
  const pdfUrl = `/orders/${order.id}/estimates/${estimate.id}/pdf`;
  const [uploadingProof, setUploadingProof] = useState(false);
  const selectedDate = fromZonedTime(date, SHOP_TIMEZONE);
  function open(value: "approved" | "declined") { setByDesignee(false); setName(customer.name); setPhone(customer.phone ?? ""); setEmail(customer.email ?? ""); setContactPhone(customer.phone ?? ""); setDecision(value); setDate(formatInTimeZone(new Date(), SHOP_TIMEZONE, "yyyy-MM-dd'T'HH:mm")); setPng(""); setParts(false); setErrors({}); }
  function save() {
    if (method === "written" && !png) { setErrors({ signature: "signatureRequired" }); return; }
    start(async () => {
      const result = await authorizeEstimate({ orderId: order.id, estimateId: estimate.id, decision, method, by_designee: byDesignee, authorizer_name: name, authorized_at: date, signature: method === "written" ? png : undefined, phone_called: method === "oral" ? phone : "", contact_email: method === "electronic" ? email : "", contact_phone: method === "electronic" ? contactPhone : "", return_parts_requested: decision === "approved" && parts });
      if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(t(`errors.${result.error}`)); return; }
      if (result.warning) toast.warning(t(`errors.${result.warning}`)); else toast.success(t("authorization.saved"));
      setDecision(null); router.refresh();
    });
  }
  const input = (key: string, label: string, value: string, set: (v: string) => void, type = "text") => <Field id={key} label={label} error={errors[key]}><Input {...fieldAria(key, errors[key])} type={type} value={value} disabled={pending || (byDesignee && key !== "authorized_at")} onChange={(e) => set(e.target.value)} /></Field>;
  return <div className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("authorization.title")}</h2>
    <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a target="_blank" rel="noopener noreferrer" href={pdfUrl}>{t("authorization.previewPdf")}</a></Button>{estimate.status === "sent" && !estimate.locked_at && <><Button disabled={pending} onClick={() => open("approved")}>{t("authorization.record")}</Button><Button variant="outline" disabled={pending} onClick={() => open("declined")}>{t("authorization.decline")}</Button></>}</div>
    {authorization && <div className="space-y-2 break-words"><p className="font-semibold">{t(`authorization.decision.${authorization.decision}`)} · {t(`authorization.method.${authorization.method}`)}</p>{authorization.by_designee && <p>{t("phase3b2.authorizedByDesignee")}</p>}<p>{formatDateTime(authorization.authorized_at)} · {authorization.authorizer_name}</p>{authorization.phone_called && <p>{t("authorization.phoneCalled")}: {formatPhone(authorization.phone_called)}</p>}{authorization.contact_email && <p>{t("authorization.email")}: {authorization.contact_email}</p>}{authorization.contact_phone && <p>{t("authorization.phone")}: {formatPhone(authorization.contact_phone)}</p>}<p>{t("authorization.returnParts")}: {t(authorization.return_parts_requested ? "estimates.yes" : "estimates.no")}</p>{signature?.url && <img src={signature.url} alt={t("authorization.signature")} className="max-h-40 w-full object-contain" />}
      {proofs.map((d) => d.url && <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-link underline">{t("authorization.proof")} · {d.caption}</a>)}
      {estimate.pdf_document_id ? <Button asChild variant="outline"><a href={`${pdfUrl}?download=1`}>{t("authorization.downloadPdf")}</a></Button> : <><p role="status" className="rounded-control bg-status-warning-bg p-3 text-status-warning-text">{t("errors.pdfPending")}</p><Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await freezeEstimatePdf({ orderId: order.id, estimateId: estimate.id }); if (!r.ok) toast.error(t(`errors.${r.error || "pdfFailed"}`)); else { toast.success(t("authorization.pdfSaved")); router.refresh(); } })}>{t("authorization.generatePdf")}</Button></>}
    </div>}
    <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!pending && !uploadingProof && !open) setDecision(null); }}><DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogTitle>{t(decision === "approved" ? "authorization.record" : "authorization.decline")}</DialogTitle><DialogDescription>{t("authorization.review")}</DialogDescription>
      <div className="rounded-control bg-muted p-3"><p>{t(`estimate_kind.${estimate.kind}`)} {estimate.seq} · <span className="font-mono">{formatRoNumber(order.ro_number)}</span></p><p className="text-3xl font-semibold">{formatMoney(totals?.total_cents ?? 0)}</p></div>
      {supplement && <p>{t("phase3b2.revisedTotal")}: <span className="font-mono">{formatMoney(supplement.authorizedBefore + (totals?.total_cents ?? 0))}</span></p>}
      {estimate.kind === "supplement" && order.designee_signed_at && <Field id="authorizer" label={t("phase3b2.authorizes")}><Select id="authorizer" value={byDesignee ? "designee" : "customer"} disabled={pending} onChange={e => { const designee = e.target.value === "designee"; setByDesignee(designee); setName((designee ? order.designee_name : customer.name) ?? ""); setPhone((designee ? order.designee_phone : customer.phone) ?? ""); setContactPhone((designee ? order.designee_phone : customer.phone) ?? ""); setEmail((designee ? order.designee_email : customer.email) ?? ""); }}><option value="customer">{t("phase3b2.customer")}</option><option value="designee">{t("phase3b2.designee")}</option></Select></Field>}
      <Field id="auth-method" label={t("authorization.methodLabel")}><Select id="auth-method" value={method} disabled={pending || uploadingProof} onChange={(e) => { setMethod(e.target.value); setPng(""); }} >{["written", "oral", "electronic"].map((m) => <option key={m} value={m}>{t(`authorization.method.${m}`)}</option>)}</Select></Field>
      {input("authorizer_name", t("authorization.name"), name, setName)}{input("authorized_at", t("authorization.date"), date, setDate, "datetime-local")}
      {Number.isFinite(selectedDate.getTime()) && <p className="text-sm text-secondary-foreground">{formatDateTime(selectedDate)}</p>}
      {method === "written" && <Field id="signature" label={t("authorization.signature")} error={errors.signature}><SignatureCanvas disabled={pending} onChange={setPng} /></Field>}
      {method === "oral" && input("phone_called", t("authorization.phoneCalled"), phone, setPhone, "tel")}
      {method === "electronic" && <>{input("contact_email", t("authorization.email"), email, setEmail, "email")}{input("contact_phone", t("authorization.phone"), contactPhone, setContactPhone, "tel")}<DocumentUpload shopId={order.shop_id} orderId={order.id} estimateId={estimate.id} kind="authorization_proof" disabled={pending} onBusyChange={setUploadingProof} label={t("authorization.addProof")} /></>}
      {decision === "approved" && <div><label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5 accent-primary" checked={parts} disabled={pending} onChange={(e) => setParts(e.target.checked)} />{t("authorization.returnParts")}</label><p className="text-sm text-secondary-foreground">{t("authorization.returnPartsHint")}</p></div>}
      <div className="flex flex-wrap gap-2"><Button disabled={pending || uploadingProof} onClick={save}>{pending ? t("common.saving") : t("authorization.save")}</Button><Button variant="outline" disabled={pending || uploadingProof} onClick={() => setDecision(null)}>{t("common.cancel")}</Button></div>
    </DialogContent></Dialog>
  </div>;
}
