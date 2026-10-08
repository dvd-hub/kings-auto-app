"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, FileImage, X } from "lucide-react";
import { getWebRequest } from "@/app/(app)/calendar/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WebRequestDetail } from "@/lib/web-requests";

const statusVariants = {
  new: "info", contacted: "warning", converted: "success", spam: "danger", closed: "neutral",
} as const;

export function WebRequestPanel({ appointmentId }: { appointmentId: string }) {
  const t = useTranslations("webRequest");
  const [, startTransition] = useTransition();
  const [loaded, setLoaded] = useState<{ appointmentId: string; result: Awaited<ReturnType<typeof getWebRequest>> } | null>(null);

  useEffect(() => {
    let active = true;
    startTransition(async () => {
      try {
        const result = await getWebRequest({ appointmentId });
        if (active) setLoaded({ appointmentId, result });
      } catch {
        if (active) setLoaded({ appointmentId, result: { ok: false } });
      }
    });
    return () => { active = false; };
  }, [appointmentId]);

  const result = loaded?.appointmentId === appointmentId ? loaded.result : null;
  if (!result) return <section aria-label={t("title")} aria-busy="true" className="border-t pt-4"><p role="status">{t("loading")}</p></section>;
  if (!result.ok) return <section aria-label={t("title")} className="border-t pt-4"><p role="alert" className="text-status-danger-text">{t("error")}</p></section>;
  if (!result.data) return <section aria-label={t("title")} className="border-t pt-4"><p>{t("notFound")}</p></section>;

  const request = result.data;
  const origin = [
    ["utmSource", request.utm_source], ["utmMedium", request.utm_medium], ["utmCampaign", request.utm_campaign],
    ["landingPage", request.landing_page], ["referrer", request.referrer],
  ] as const;
  const hasOrigin = request.hasMetaAd || origin.some(([, value]) => Boolean(value));

  return <section aria-label={t("title")} className="min-w-0 space-y-4 border-t pt-4">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-xl font-bold">{t("title")}</h3>
        <StatusBadge variant={statusVariants[request.status]} label={t(`status.${request.status}`)} />
        {request.needs_tow && <StatusBadge variant="warning" label={t("towNeeded")} />}
      </div>
      <p className="text-sm text-secondary-foreground">{t("received", { date: formatDateTime(request.created_at) })}</p>
    </header>
    {request.needs_tow && <p className="rounded-control bg-status-warning-bg p-3 text-sm font-medium text-status-warning-text">{t("towInstructions")}</p>}
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Field label={t("service")} value={request.service || t("notProvided")} />
      <Field label={t("damageDescription")} value={request.damage_description} className="sm:col-span-2" />
      <Field label={t("insurance")} value={t(request.is_insurance_claim ? "yes" : "no")} />
      {request.is_insurance_claim && <>
        <Field label={t("insurer")} value={request.insurer_name || t("notProvided")} />
        <Field label={t("claimNumber")} value={request.claim_number || t("notProvided")} mono />
      </>}
      <Field label={t("preferredDate")} value={formatDate(new Date(`${request.preferred_date}T12:00:00Z`), "UTC")} />
      <Field label={t("preferredWindow")} value={t(`window.${request.preferred_window}`)} />
      <Field label={t("language")} value={t(request.locale === "es" ? "spanish" : "english")} />
      <Field label={t("marketing")} value={t(request.marketing_opt_in ? "yes" : "no")} />
    </dl>
    <div className="space-y-2">
      <h4 className="font-semibold">{t("origin")}</h4>
      {hasOrigin ? <>
        {request.hasMetaAd && <p>{t("metaAd")}</p>}
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
          {origin.map(([label, value]) => value && <Field key={label} label={t(label)} value={value} />)}
        </dl>
      </> : <p>{t("direct")}</p>}
    </div>
    <RequestPhotos photos={request.photos} />
  </section>;
}

function Field({ label, value, className = "", mono = false }: { label: string; value: string; className?: string; mono?: boolean }) {
  return <div className={`min-w-0 ${className}`}>
    <dt className="text-sm text-secondary-foreground">{label}</dt>
    <dd className={`whitespace-pre-wrap break-words ${mono ? "font-mono" : ""}`}>{value}</dd>
  </div>;
}

function RequestPhotos({ photos }: { photos: WebRequestDetail["photos"] }) {
  const t = useTranslations("webRequest");
  const [selected, setSelected] = useState<number | null>(null);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const trigger = useRef<HTMLButtonElement | null>(null);
  const previewable = photos.filter((photo) => photo.url && photo.mime_type.startsWith("image/") && photo.mime_type !== "image/heic" && !failed.has(photo.id));
  const photo = selected === null ? null : previewable[selected];
  const label = (index: number) => t("photoAlt", { number: index + 1, total: photos.length });
  const fail = (id: string) => { setFailed((current) => new Set(current).add(id)); setSelected(null); };
  function move(direction: number) {
    setSelected((current) => current === null ? null : (current + direction + previewable.length) % previewable.length);
  }

  return <div className="space-y-2">
    <h4 className="font-semibold">{t("photos")}</h4>
    {photos.length === 0 ? <p className="text-secondary-foreground">{t("noPhotos")}</p> : <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
      {photos.map((item, index) => previewable.includes(item) ? <button
        key={item.id} type="button" aria-label={label(index)}
        className="aspect-square min-h-[96px] min-w-[96px] overflow-hidden rounded-control border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={(event) => { trigger.current = event.currentTarget; setSelected(previewable.indexOf(item)); }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Signed URLs expire; avoid image optimization and caching. */}
        <img src={item.url!} alt={label(index)} className="size-full object-cover" onError={() => fail(item.id)} />
      </button> : <div key={item.id} className="flex aspect-square min-h-[96px] min-w-[96px] flex-col items-center justify-center rounded-control border bg-muted p-2 text-center">
        <FileImage className="size-6 shrink-0 text-secondary-foreground" aria-hidden="true" />
        <span className="text-sm">{label(index)}</span>
        {item.url ? <a href={`${item.url}&download=`} download target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-link underline hover:text-link-hover">{t("download")}</a> : <>
          <a role="link" aria-disabled="true" className="inline-flex min-h-[44px] items-center text-secondary-foreground">{t("download")}</a>
          <span className="text-xs text-secondary-foreground">{t("photoUnavailable")}</span>
        </>}
      </div>)}
    </div>}
    <Dialog open={Boolean(photo)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent
        showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl"
        onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}
        onKeyDown={(event) => {
          if (previewable.length < 2) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
        }}
      >
        {photo && <>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="font-display text-xl font-bold">{label(photos.indexOf(photo))}</DialogTitle>
            <DialogClose asChild><Button type="button" variant="ghost" className="min-h-[44px] min-w-[44px]" aria-label={t("close")}><X aria-hidden="true" /></Button></DialogClose>
          </div>
          <DialogDescription className="sr-only">{t("photoViewer")}</DialogDescription>
          {/* eslint-disable-next-line @next/next/no-img-element -- Signed URLs expire; avoid image optimization and caching. */}
          <img src={photo.url!} alt={label(photos.indexOf(photo))} className="max-h-[80vh] w-full object-contain" onError={() => fail(photo.id)} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {previewable.length > 1 && <div className="flex gap-2">
              <Button type="button" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => move(-1)}><ChevronLeft aria-hidden="true" />{t("previous")}</Button>
              <Button type="button" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => move(1)}>{t("next")}<ChevronRight aria-hidden="true" /></Button>
            </div>}
            <a href={photo.url!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-link underline hover:text-link-hover">{t("openOriginal")}</a>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
