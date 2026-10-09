"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SignatureCanvas } from "@/components/orders/signature-canvas";
import { Field, fieldAria } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { RemoteResult } from "./actions";

export function RemoteSignatureForm({ name, amount, sign }: {
  name: string; amount: string; sign: (input: unknown) => Promise<RemoteResult>;
}) {
  const t = useTranslations(), router = useRouter();
  const [authorizer, setAuthorizer] = useState(name);
  const [signature, setSignature] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [parts, setParts] = useState(false);
  const [decline, setDecline] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(decision: "approved" | "declined") {
    setError(null); setErrors({});
    start(async () => {
      try {
        const result = await sign({ decision, authorizer_name: authorizer, signature, confirmed,
          return_parts_requested: decision === "approved" && parts });
        if (result.ok) { router.refresh(); return; }
        setErrors(result.fieldErrors ?? {});
        setError(result.error ?? null);
        if (result.error === "alreadySigned") router.refresh();
        setDecline(false);
      } catch { setError("saveFailed"); setDecline(false); }
    });
  }
  return <section className="space-y-5 rounded-card border border-border bg-surface p-5 sm:p-6">
    <h2 className="border-b border-border pb-4">{t("remoteEstimate.authorization")}</h2>
    <form noValidate className="space-y-5" onSubmit={event => { event.preventDefault(); submit("approved"); }}>
      <Field id="remote-name" label={t("authorization.name")} error={errors.authorizer_name}>
        <Input {...fieldAria("remote-name", errors.authorizer_name)} autoComplete="name" maxLength={200} value={authorizer} disabled={pending} onChange={e => setAuthorizer(e.target.value)} />
      </Field>
      <div><label className="flex min-h-11 items-start gap-3 py-2"><input id="remote-confirmed" type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" checked={confirmed} disabled={pending} aria-invalid={Boolean(errors.confirmed)} aria-describedby={errors.confirmed ? "remote-confirmed-error" : undefined} onChange={e => setConfirmed(e.target.checked)} /><span>{t("remoteEstimate.consent", { amount })}</span></label>
        {errors.confirmed && <p id="remote-confirmed-error" role="alert" className="text-status-danger-text">{t("remoteEstimate.consentRequired")}</p>}
      </div>
      <label className="flex min-h-11 items-start gap-3 py-2"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" checked={parts} disabled={pending} onChange={e => setParts(e.target.checked)} /><span>{t("authorization.returnParts")}<span className="mt-1 block text-sm text-secondary-foreground">{t("authorization.returnPartsHint")} · {t("remoteEstimate.onlyApproval")}</span></span></label>
      <Field id="remote-signature" label={t("authorization.signature")} error={errors.signature}>
        <SignatureCanvas disabled={pending} onChange={setSignature} />
      </Field>
      {error && <p role="alert" className="rounded-control bg-status-danger-bg p-3 text-status-danger-text">{t(`remoteEstimate.errors.${error}`)}</p>}
      <div className="flex flex-col gap-3"><Button type="submit" className="min-h-[56px] w-full whitespace-normal py-4 text-lg" disabled={pending}>{pending ? t("common.saving") : t("remoteEstimate.approve")}</Button><Button type="button" variant="outline" className="min-h-11 w-full" disabled={pending} onClick={() => setDecline(true)}>{t("remoteEstimate.decline")}</Button></div>
    </form>
    <Dialog open={decline} onOpenChange={open => { if (!pending) setDecline(open); }}><DialogContent showCloseButton={false}><DialogTitle>{t("remoteEstimate.declineTitle")}</DialogTitle><DialogDescription>{t("remoteEstimate.declineText")}</DialogDescription><DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setDecline(false)}>{t("common.cancel")}</Button><Button type="button" variant="destructive" disabled={pending} onClick={() => submit("declined")}>{t("remoteEstimate.confirmDecline")}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
