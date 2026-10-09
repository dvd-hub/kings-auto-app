"use client";

/* Private Storage signed image URLs require ordinary img elements. */
/* eslint-disable @next/next/no-img-element */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field, fieldAria } from "@/components/form-field";
import { DocumentUpload } from "./document-upload";
import { documentName, type SignedDocument } from "@/lib/document-shared";
import { editDocument } from "@/app/(app)/orders/document-actions";

export function OrderDocuments({ orderId, shopId, documents, loadFailed = false }: { orderId: string; shopId: string; documents: SignedDocument[]; loadFailed?: boolean }) {
  const t = useTranslations(), router = useRouter();
  const [selected, setSelected] = useState<SignedDocument | null>(null), [caption, setCaption] = useState(""), [confirm, setConfirm] = useState(false), [fieldError, setFieldError] = useState<string>(), [pending, start] = useTransition();
  const image = (d: SignedDocument) => d.mime_type.startsWith("image/") && d.mime_type !== "image/heic";
  function save(remove: boolean) {
    if (!selected) return;
    start(async () => {
      const result = await editDocument({ orderId, documentId: selected.id, caption, remove });
      if (!result.ok) { setFieldError(result.fieldErrors?.caption); toast.error(t(`errors.${result.error || "save"}`)); return; }
      setSelected(null); setConfirm(false); router.refresh(); toast.success(t("documents.saved"));
    });
  }
  return <div className="min-w-0 space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("documents.title")}</h2>
    <div className="flex flex-wrap gap-4"><DocumentUpload shopId={shopId} orderId={orderId} kind="photo" multiple label={t("documents.addPhotos")} /><DocumentUpload shopId={shopId} orderId={orderId} kind="other" label={t("documents.addDocument")} /></div>
    {loadFailed && <p role="alert">{t("errors.documentRead")}</p>}
    {!documents.length && !loadFailed && <p className="text-secondary-foreground">{t("documents.empty")}</p>}
    <ul className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{documents.map((d) => <li key={d.id} className="min-w-0"><button type="button" className="min-h-11 w-full overflow-hidden rounded-control border border-border text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setSelected(d); setCaption(d.caption ?? ""); setConfirm(false); setFieldError(undefined); }}>
      {image(d) && d.url ? <img src={d.url} alt={documentName(d)} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-muted p-3 text-center">{t(d.mime_type === "image/heic" ? "documents.heic" : "documents.file")}</div>}<p className="break-words p-3 text-sm">{documentName(d)}</p>
    </button></li>)}</ul>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!pending && !open) setSelected(null); }}><DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogTitle>{t("documents.viewer")}</DialogTitle><DialogDescription>{t("documents.privateLink")}</DialogDescription>
      {selected && <>{image(selected) && selected.url && <img src={selected.url} alt={documentName(selected)} className="max-h-[50dvh] w-full object-contain" />}
        {selected.url ? <a className="inline-flex min-h-11 items-center break-all text-link underline" target="_blank" rel="noopener noreferrer" href={selected.url}>{t("documents.openFile")}</a> : <p role="alert">{t("errors.documentRead")}</p>}
        <Field id="caption" label={t("documents.caption")} error={fieldError}><Input {...fieldAria("caption", fieldError)} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={pending} maxLength={1000} /></Field>
        {confirm && <p role="alert" className="rounded-control bg-status-warning-bg p-3 text-status-warning-text">{t("documents.removeConfirm")}</p>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => save(false)}>{t("common.save")}</Button><Button variant="outline" disabled={pending} onClick={() => setSelected(null)}>{t("common.cancel")}</Button>{confirm ? <><Button variant="destructive" disabled={pending} onClick={() => save(true)}>{t("documents.confirmRemove")}</Button><Button variant="outline" disabled={pending} onClick={() => setConfirm(false)}>{t("documents.keep")}</Button></> : <Button variant="outline" disabled={pending} onClick={() => setConfirm(true)}>{t("documents.remove")}</Button>}</div>
      </>}
    </DialogContent></Dialog>
  </div>;
}
