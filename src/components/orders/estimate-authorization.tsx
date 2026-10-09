"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { toast } from "sonner";
import { SHOP_TIMEZONE } from "@/lib/config";
import { formatDateTime, formatMoney, formatPhone, formatRoNumber } from "@/lib/format";
import type { Authorization, SignedDocument } from "@/lib/document-shared";
import type { Estimate, EstimateTotals } from "@/lib/orders";
import { authorizeEstimate, freezeEstimatePdf } from "@/app/(app)/orders/estimate-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, fieldAria } from "@/components/form-field";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DocumentUpload } from "./document-upload";

function SignatureCanvas({ onChange, disabled }: { onChange: (png: string) => void; disabled: boolean }) {
  const t = useTranslations(), canvas = useRef<HTMLCanvasElement>(null), drawing = useRef(false), last = useRef<{ x: number; y: number } | null>(null);
  function point(event: React.PointerEvent<HTMLCanvasElement>) { const r = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - r.left) * 900 / r.width, y: (event.clientY - r.top) * 300 / r.height }; }
  function finish() { if (!drawing.current) return; drawing.current = false; last.current = null; onChange(canvas.current?.toDataURL("image/png") ?? ""); }
  return <div className="space-y-2"><canvas ref={canvas} width={900} height={300} aria-label={t("authorization.signature")} className="h-40 w-full touch-none rounded-control border border-input bg-surface" onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = point(e); }} onPointerMove={(e) => {
    if (!drawing.current || disabled || !last.current) return;
    const ctx = e.currentTarget.getContext("2d"), p = point(e);
    if (ctx) { ctx.strokeStyle = getComputedStyle(e.currentTarget).color; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    last.current = p;
  }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} /><Button type="button" variant="outline" disabled={disabled} onClick={() => { canvas.current?.getContext("2d")?.clearRect(0, 0, 900, 300); onChange(""); }}>{t("authorization.clear")}</Button></div>;
}

export function EstimateAuthorization({ estimate, totals, order, customer, authorization, signature, proofs }: {
  estimate: Estimate; totals: EstimateTotals | null; order: { id: string; ro_number: number; shop_id: string }; customer: { name: string; phone: string | null; email: string | null }; authorization: Authorization | null; signature: SignedDocument | null; proofs: SignedDocument[];
}) {
  const t = useTranslations(), router = useRouter();
  const [decision, setDecision] = useState<"approved" | "declined" | null>(null), [method, setMethod] = useState("written"), [name, setName] = useState(customer.name), [date, setDate] = useState(""), [phone, setPhone] = useState(customer.phone ?? ""), [email, setEmail] = useState(customer.email ?? ""), [contactPhone, setContactPhone] = useState(customer.phone ?? ""), [png, setPng] = useState(""), [parts, setParts] = useState(false), [errors, setErrors] = useState<Record<string, string>>({}), [pending, start] = useTransition();
  const pdfUrl = `/orders/${order.id}/estimates/${estimate.id}/pdf`;
  const [uploadingProof, setUploadingProof] = useState(false);
  const selectedDate = fromZonedTime(date, SHOP_TIMEZONE);
  function open(value: "approved" | "declined") { setDecision(value); setDate(formatInTimeZone(new Date(), SHOP_TIMEZONE, "yyyy-MM-dd'T'HH:mm")); setPng(""); setParts(false); setErrors({}); }
  function save() {
    if (method === "written" && !png) { setErrors({ signature: "signatureRequired" }); return; }
    start(async () => {
      const result = await authorizeEstimate({ orderId: order.id, estimateId: estimate.id, decision, method, authorizer_name: name, authorized_at: date, signature: method === "written" ? png : undefined, phone_called: method === "oral" ? phone : "", contact_email: method === "electronic" ? email : "", contact_phone: method === "electronic" ? contactPhone : "", return_parts_requested: decision === "approved" && parts });
      if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(t(`errors.${result.error}`)); return; }
      if (result.warning) toast.warning(t(`errors.${result.warning}`)); else toast.success(t("authorization.saved"));
      setDecision(null); router.refresh();
    });
  }
  const input = (key: string, label: string, value: string, set: (v: string) => void, type = "text") => <Field id={key} label={label} error={errors[key]}><Input {...fieldAria(key, errors[key])} type={type} value={value} disabled={pending} onChange={(e) => set(e.target.value)} /></Field>;
  return <div className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("authorization.title")}</h2>
    <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a target="_blank" rel="noopener noreferrer" href={pdfUrl}>{t("authorization.previewPdf")}</a></Button>{estimate.status === "sent" && !estimate.locked_at && <><Button disabled={pending} onClick={() => open("approved")}>{t("authorization.record")}</Button><Button variant="outline" disabled={pending} onClick={() => open("declined")}>{t("authorization.decline")}</Button></>}</div>
    {authorization && <div className="space-y-2 break-words"><p className="font-semibold">{t(`authorization.decision.${authorization.decision}`)} · {t(`authorization.method.${authorization.method}`)}</p><p>{formatDateTime(authorization.authorized_at)} · {authorization.authorizer_name}</p>{authorization.phone_called && <p>{t("authorization.phoneCalled")}: {formatPhone(authorization.phone_called)}</p>}{authorization.contact_email && <p>{t("authorization.email")}: {authorization.contact_email}</p>}{authorization.contact_phone && <p>{t("authorization.phone")}: {formatPhone(authorization.contact_phone)}</p>}<p>{t("authorization.returnParts")}: {t(authorization.return_parts_requested ? "estimates.yes" : "estimates.no")}</p>{signature?.url && <img src={signature.url} alt={t("authorization.signature")} className="max-h-40 w-full object-contain" />}
      {proofs.map((d) => d.url && <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-link underline">{t("authorization.proof")} · {d.caption}</a>)}
      {estimate.pdf_document_id ? <Button asChild variant="outline"><a href={`${pdfUrl}?download=1`}>{t("authorization.downloadPdf")}</a></Button> : <><p role="status" className="rounded-control bg-status-warning-bg p-3 text-status-warning-text">{t("errors.pdfPending")}</p><Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await freezeEstimatePdf({ orderId: order.id, estimateId: estimate.id }); if (!r.ok) toast.error(t(`errors.${r.error || "pdfFailed"}`)); else { toast.success(t("authorization.pdfSaved")); router.refresh(); } })}>{t("authorization.generatePdf")}</Button></>}
    </div>}
    <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!pending && !uploadingProof && !open) setDecision(null); }}><DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogTitle>{t(decision === "approved" ? "authorization.record" : "authorization.decline")}</DialogTitle><DialogDescription>{t("authorization.review")}</DialogDescription>
      <div className="rounded-control bg-muted p-3"><p>{t(`estimate_kind.${estimate.kind}`)} {estimate.seq} · <span className="font-mono">{formatRoNumber(order.ro_number)}</span></p><p className="text-3xl font-semibold">{formatMoney(totals?.total_cents ?? 0)}</p></div>
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
