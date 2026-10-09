"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { MAX_DOCUMENT_BYTES, DOCUMENT_MIMES, documentExtensions } from "@/lib/document-shared";
import { registerDocument } from "@/app/(app)/orders/document-actions";
import { Button } from "@/components/ui/button";
import type { OrderResult } from "@/lib/orders";

export function DocumentUpload({ shopId, orderId, estimateId, kind, label, multiple = false, disabled = false, onUploaded, onBusyChange }: {
  shopId: string; orderId: string; estimateId?: string; kind: "photo" | "third_party_estimate" | "authorization_proof" | "other";
  label: string; multiple?: boolean; disabled?: boolean; onUploaded?: (id: string) => Promise<OrderResult>; onBusyChange?: (busy: boolean) => void;
}) {
  const t = useTranslations(), router = useRouter(), input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [states, setStates] = useState<{ name: string; status: string; error?: string; warning?: string }[]>([]);
  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setStates(files.map((file) => ({ name: file.name, status: "waiting" })));
    const update = (index: number, status: string, error?: string, warning?: string) => setStates((rows) => rows.map((r, i) => i === index ? { ...r, status, error, warning } : r));
    for (const [index, file] of files.entries()) {
      const mime = file.type || (/\.heic$/i.test(file.name) ? "image/heic" : "");
      if (!file.size || file.size > MAX_DOCUMENT_BYTES) { update(index, "failed", "documentSize"); continue; }
      if (!DOCUMENT_MIMES.some((m) => m === mime) || (kind === "photo" && !mime.startsWith("image/"))) { update(index, "failed", "documentMime"); continue; }
      const folder = kind === "photo" ? "photos" : kind === "third_party_estimate" ? `estimates/${estimateId}` : "auth";
      const storage_path = `${shopId}/ro/${orderId}/${folder}/${crypto.randomUUID()}.${documentExtensions[mime]}`;
      let uploaded = false;
      try {
        update(index, "uploading");
        const { error } = await createClient().storage.from("documents").upload(storage_path, file, { upsert: false, contentType: mime });
        if (error) { update(index, "failed", "documentUpload"); continue; }
        uploaded = true;
        update(index, "registering");
        const result = await registerDocument({ storage_path, kind, repair_order_id: orderId, ...(estimateId ? { estimate_id: estimateId } : {}), caption: file.name });
        if (!result.ok) { update(index, "failed", result.error || "documentOrphan", result.warning); continue; }
        if (onUploaded) {
          const attached = await onUploaded(result.id);
          if (!attached.ok) { update(index, "failed", attached.error || "save"); continue; }
        }
        update(index, "done");
      } catch { update(index, "failed", uploaded ? "documentOrphan" : "documentUpload"); }
    }
    setBusy(false);
    onBusyChange?.(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }
  return <div className="min-w-0 space-y-2">
    <input ref={input} className="sr-only" tabIndex={-1} type="file" multiple={multiple} accept={kind === "photo" ? "image/*" : "application/pdf,image/jpeg,image/png,image/webp,image/heic,.heic"} capture={kind === "photo" ? "environment" : undefined} disabled={busy || disabled} aria-label={label} onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
    <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => input.current?.click()}>{label}</Button>
    <p className="text-sm text-secondary-foreground">{t("documents.limit")}</p>
    <ul aria-live="polite" className="space-y-1 text-sm">{states.map((row, index) => <li key={index} className="break-words">{row.name}: {t(`documents.upload.${row.status}`)}{row.error && <p role="alert" className="text-status-danger-text">{t(`errors.${row.error}`)}</p>}{row.warning && row.warning !== row.error && <p className="text-status-warning-text">{t(`errors.${row.warning}`)}</p>}</li>)}</ul>
  </div>;
}
