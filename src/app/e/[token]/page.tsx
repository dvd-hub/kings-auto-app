import type { Metadata } from "next";
import Image from "next/image";
import { CircleAlert, CircleCheck, FileText, Phone } from "lucide-react";
import { createTranslator } from "next-intl";
import { getAppMessages } from "@/i18n/messages";
import { IntlProvider } from "@/components/intl-provider";
import { customerName, vehicleLabel } from "@/lib/customers";
import { formatMoney, formatDateTime, formatPhone, formatMiles, formatRoNumber } from "@/lib/format";
import { SHOP_TIMEZONE } from "@/lib/config";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { loadPublicEstimate, publicEstimateData, publicPdfDownload, reviewFingerprint, type PublicLinkError } from "../link-data";
import { signPublicEstimate } from "../actions";
import { RemoteSignatureForm } from "../signature-form";
import type { EstimatePdfData } from "@/lib/pdf/estimate-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicEstimatePage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  let ctx: Awaited<ReturnType<typeof loadPublicEstimate>> | null;
  try { ctx = await loadPublicEstimate(token); } catch { ctx = null; }
  const locale = query.lang === "es" || query.lang === "en" ? query.lang : ctx?.locale === "es" ? "es" : "en";
  const messages = await getAppMessages(locale);
  const t = createTranslator({ locale, messages, timeZone: SHOP_TIMEZONE });
  const contact = ctx?.contact;
  const shopName = contact?.legal_name || contact?.name || t("common.brand");
  const shopAddress = contact ? [contact.address_line1, contact.address_line2, [contact.city, contact.state, contact.zip].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : "";
  const languages = <nav aria-label={t("remoteEstimate.language")} className="flex gap-3"><a href="?lang=en" hrefLang="en" aria-current={locale === "en" ? "page" : undefined} className="inline-flex min-h-11 items-center text-link underline">{t("webRequest.english")}</a><a href="?lang=es" hrefLang="es" aria-current={locale === "es" ? "page" : undefined} className="inline-flex min-h-11 items-center text-link underline">{t("webRequest.spanish")}</a></nav>;
  const phoneLink = ctx?.phone ? <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto"><a href={`tel:${ctx.phone}`}><Phone aria-hidden="true" />{formatPhone(ctx.phone)}</a></Button> : null;
  function shell(children: React.ReactNode) {
    return <IntlProvider locale={locale} messages={messages}><div lang={locale} className="min-h-screen">
      <header className="border-b-4 border-primary bg-sidebar px-5 py-7"><Image src="/logo.png" alt={t("common.brand")} width={720} height={173} className="mx-auto h-auto w-[220px] max-w-full" /></header>
      <main className="mx-auto w-full min-w-0 max-w-3xl space-y-5 px-4 pb-6 [overflow-wrap:anywhere] sm:px-6 sm:pb-10"><div className="flex justify-end pt-2">{languages}</div>{children}</main>
      <footer className="mx-auto max-w-3xl space-y-1 border-t border-border px-5 py-6 text-center text-sm text-secondary-foreground [overflow-wrap:anywhere]"><p className="font-semibold">{shopName}</p>{shopAddress && <p>{shopAddress}</p>}</footer>
    </div></IntlProvider>;
  }
  function unavailable(reason: PublicLinkError) {
    return shell(<section className="space-y-5 rounded-card border border-border bg-surface p-6 sm:p-8"><div className="flex size-12 items-center justify-center rounded-badge bg-status-warning-bg text-status-warning-text"><CircleAlert aria-hidden="true" className="size-6" /></div><h1 className="text-3xl">{t("remoteEstimate.unavailableTitle")}</h1><p>{t(`remoteEstimate.errors.${reason}`)}</p><p className="text-secondary-foreground">{t("remoteEstimate.contactShop")}</p>{phoneLink}</section>);
  }
  if (!ctx) return unavailable("notConfigured");
  if (ctx.error) return unavailable(ctx.error);
  if (!ctx.link || !ctx.estimate || !ctx.tokenHash) return unavailable("unavailable");
  if (ctx.link.used_at) {
    const download = await publicPdfDownload(ctx);
    return shell(<section className="space-y-5 rounded-card border border-border bg-surface p-6 sm:p-8"><div className={`flex size-12 items-center justify-center rounded-badge ${ctx.decision === "declined" ? "bg-status-neutral-bg text-status-neutral-text" : "bg-status-success-bg text-status-success-text"}`}><CircleCheck aria-hidden="true" className="size-6" /></div><h1 className="text-3xl">{t(ctx.decision === "declined" ? "remoteEstimate.alreadyDeclined" : "remoteEstimate.alreadySigned")}</h1><p>{t(ctx.decision === "declined" ? "remoteEstimate.thanksDeclined" : "remoteEstimate.thanks")}</p>{download ? <><Button asChild className="min-h-11 w-full whitespace-normal py-3 sm:w-auto"><a href={download} rel="noreferrer"><FileText aria-hidden="true" />{t("remoteEstimate.download")}</a></Button><p className="text-sm text-secondary-foreground">{t("remoteEstimate.downloadExpiry")}</p></> : <p role="status">{t("remoteEstimate.pdfPending")}</p>}{phoneLink}</section>);
  }
  let data: EstimatePdfData;
  try {
    const { error } = await ctx.admin.rpc("mark_estimate_link_opened", { p_token_hash: ctx.tokenHash });
    if (error) return unavailable("unavailable");
    data = await publicEstimateData(ctx);
  } catch { return unavailable("unavailable"); }
  const { shop, order, estimate, customer, vehicle, lines, totals, supplement } = data;
  const address = [shop.address_line1, shop.address_line2, [shop.city, shop.state, shop.zip].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const roleTotal = (role: "teardown" | "reassembly") => formatMoney(lines.filter(line => line.teardown_role === role).reduce((sum, line) => sum + (line.amount_cents ?? 0), 0));
  return shell(<>
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="space-y-3 p-5 sm:p-6"><h1 className="text-3xl sm:text-4xl">{t(`estimate_kind.${estimate.kind}`)} {estimate.seq}</h1><p className="font-mono text-sm text-secondary-foreground">{formatRoNumber(order.ro_number)}</p><p className="break-words text-lg font-semibold">{vehicleLabel(vehicle)}</p></div>
      <div className="space-y-4 border-t border-border bg-muted/40 p-5 sm:p-6"><div className="flex flex-wrap items-baseline justify-between gap-3"><p className="font-heading text-xl font-bold uppercase">{t("estimates.totals.total_cents")}</p><p className="break-all font-heading text-4xl font-bold tabular-nums sm:text-5xl">{formatMoney(totals.total_cents ?? 0)}</p></div><Button asChild variant="outline" className="min-h-11 w-full border-input-border bg-surface py-3 sm:w-auto"><a href={`/e/${token}/pdf?lang=${locale}`} target="_blank" rel="noreferrer"><FileText aria-hidden="true" />{t("remoteEstimate.viewPdf")}</a></Button><p className="text-sm text-secondary-foreground">{t("remoteEstimate.expires", { when: formatDateTime(ctx.link.expires_at) })}</p></div>
    </section>
    <section className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6">
      <div className="space-y-1"><h2>{shop.legal_name || shop.name}</h2>{address && <p>{address}</p>}{shop.phone && <a href={`tel:${shop.phone}`} className="inline-flex min-h-11 items-center text-link underline">{formatPhone(shop.phone)}</a>}{shop.email && <p className="break-words">{shop.email}</p>}{shop.bar_registration_number && <p>{t("remoteEstimate.barNumber", { number: shop.bar_registration_number })}</p>}</div>
      <div className="space-y-1 border-t border-border pt-4"><h2>{t("remoteEstimate.customerVehicle")}</h2><p>{customerName(customer)}</p><p>{vehicleLabel(vehicle)}</p><p className="break-all font-mono">{t("remoteEstimate.vin", { vin: vehicle.vin || t("remoteEstimate.notAvailable") })}</p><p>{t("remoteEstimate.plate", { plate: vehicle.plate || t("remoteEstimate.notAvailable") })} · {formatMiles(order.odometer_in)}</p></div>
      <div><h2>{t("remoteEstimate.requestedRepairs")}</h2><p className="whitespace-pre-wrap break-words">{order.requested_repairs}</p></div>
    </section>
    <section className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("estimates.lines")}</h2><ol className="divide-y divide-border">{lines.map((line, index) => <li key={index} className="space-y-3 py-4 first:pt-0 last:pb-0"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0 space-y-2"><p className="whitespace-pre-wrap break-words font-semibold">{line.description}</p><StatusBadge variant="neutral" label={t(`estimate_line_type.${line.line_type}`)} /></div><span className="font-mono font-semibold tabular-nums">{formatMoney(line.amount_cents ?? 0)}</span></div><p className="text-sm text-secondary-foreground">{t(line.line_type === "labor" ? "estimates.hours" : "estimates.quantity")}: {line.quantity} · {t("estimates.unitPrice")}: {formatMoney(line.unit_price_cents)}</p>
      {line.line_type === "part" && <div className="space-y-1 text-sm"><p>{t("estimates.partCondition")}: {line.part_condition && t(`part_condition.${line.part_condition}`)}</p><p>{t("estimates.crashPart")}: {t(line.is_crash_part ? "estimates.yes" : "estimates.no")}{line.crash_part_origin && <> · {t(`crash_part_origin.${line.crash_part_origin}`)}</>}</p>{line.part_number && <p>{t("estimates.partNumber")}: {line.part_number}</p>}{line.brand && <p>{t("estimates.brand")}: {line.brand}</p>}{line.non_returnable && <p>{t("estimates.nonReturnableHint")}</p>}</div>}
      {line.labor_type && <p>{t(`labor_type.${line.labor_type}`)}</p>}{line.paint_materials_method && <p>{t(`paint_materials_method.${line.paint_materials_method}`)}</p>}{line.teardown_role && <p>{t(`teardown_role.${line.teardown_role}`)}</p>}{line.line_type === "sublet" && <p>{t("estimates.vendorName")}: {line.sublet_vendor_name} · {line.sublet_vendor_address || t("remoteEstimate.subletLocation")}</p>}{line.line_type === "hazardous_waste" && <p>{t("remoteEstimate.epaNumber", { number: shop.epa_id_number || t("remoteEstimate.notAvailable") })}</p>}
    </li>)}</ol></section>
    <section className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("estimates.summary")}</h2><dl className="space-y-3">{(["parts_cents", "labor_cents", "materials_cents", "sublet_cents", "hazardous_waste_cents", "total_cents"] as const).map(key => <div key={key} className={`flex flex-wrap items-baseline justify-between gap-2 ${key === "total_cents" ? "rounded-control bg-sidebar p-4 text-xl font-bold text-sidebar-active-foreground" : ""}`}><dt>{t(`estimates.totals.${key}`)}</dt><dd className={`font-mono tabular-nums ${key === "total_cents" ? "text-2xl" : "font-semibold"}`}>{formatMoney(totals[key] ?? 0)}</dd></div>)}</dl><p className="text-sm text-secondary-foreground">{t("estimates.salesTax")}</p>
      {supplement && <dl className="space-y-3 border-t border-border pt-4">{([["authorizedBefore", supplement.authorizedBefore], ["supplementAmount", totals.total_cents ?? 0], ["revisedTotal", supplement.authorizedBefore + (totals.total_cents ?? 0)]] as const).map(([key, amount]) => <div key={key} className="flex flex-wrap justify-between gap-2"><dt>{t(`phase3b2.${key}`)}</dt><dd className="font-mono font-semibold">{formatMoney(amount)}</dd></div>)}</dl>}
    </section>
    <section className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("remoteEstimate.legalTerms")}</h2>
      {estimate.kind === "teardown" && <div className="space-y-3"><h3>{t("estimates.teardownDetails")}</h3><p>{t("estimates.teardownArea")}: {estimate.teardown_area}</p><p>{t("remoteEstimate.teardownCosts", { teardown: roleTotal("teardown"), reassembly: roleTotal("reassembly") })}</p><p>{t("remoteEstimate.destroyedParts", { parts: lines.filter(line => line.teardown_role === "destroyed_item").map(line => line.description).join("; ") || t("remoteEstimate.noneListed") })}</p><p>{t("remoteEstimate.reassemblyDays", { days: estimate.reassembly_max_days ?? 0 })}</p>{estimate.pickup_deadline_days && <p>{t("remoteEstimate.pickupDays", { days: estimate.pickup_deadline_days })}</p>}{estimate.teardown_may_prevent_restoration && <p>{t("remoteEstimate.preventRestoration")}</p>}</div>}
      {estimate.payor_name && <div className="space-y-3"><h3>{t("estimates.payor")}</h3><p>{estimate.payor_name} · {t("estimates.claimNumber")}: {estimate.payor_claim_number}</p>{estimate.basis === "third_party" && <><p>{t("remoteEstimate.thirdPartyBasis")}</p><p>{t("estimates.payorTotal")}: {formatMoney(estimate.payor_estimate_total_cents ?? 0)}</p><p>{t("remoteEstimate.thirdPartyRegulations")}</p></>}{estimate.payor_approved_amount_cents !== null ? <p>{t("estimates.payorApproved")}: {formatMoney(estimate.payor_approved_amount_cents)}</p> : <><p lang="en">{messages.estimates.payorLegal}</p>{locale === "es" && <><p className="font-semibold">{t("estimates.informationalTranslation")}</p><p>{t("estimates.payorLegalTranslation")}</p></>}</>}</div>}
      <p>{t("authorization.returnPartsHint")}</p><p>{t("remoteEstimate.electronicConsent")}</p>
    </section>
    <RemoteSignatureForm name={customerName(customer)} amount={formatMoney(totals.total_cents ?? 0)} sign={signPublicEstimate.bind(null, token, reviewFingerprint(data))} />
  </>);
}
