import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatInvoiceNumber, formatRoNumber, formatMoney, formatDateTime, formatMiles } from "@/lib/format";
import { customerName, vehicleLabel } from "@/lib/customers";
import { draftInvoiceTotals, issuedInvoiceTotals, invoiceStatusVariants } from "@/lib/invoices";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { InvoiceDraft, VoidInvoiceButton, InvoicePdfRecovery } from "@/components/orders/invoice-controls";
import { InvoiceSummary } from "@/components/orders/invoice-summary";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const t = await getT();
  const supabase = await createClient();
  const [orderResult, invoiceResult] = await Promise.all([
    supabase.from("repair_orders").select("*,customers(*),vehicles(*)").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("invoices").select("*").eq("repair_order_id", id).neq("status", "voided").is("deleted_at", null).maybeSingle(),
  ]);
  if (orderResult.error || invoiceResult.error) return <p role="alert">{t("errors.load")}</p>;
  const order = orderResult.data, invoice = invoiceResult.data;
  if (!order || !invoice) notFound();
  const draft = invoice.status === "draft";
  const [linesResult, shopResult, authResult] = await Promise.all([
    supabase.from("invoice_lines").select("*").eq("invoice_id", invoice.id).is("deleted_at", null).order("position").order("id"),
    draft ? supabase.from("shops").select("sales_tax_rate").eq("id", invoice.shop_id).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null, error: null }),
    draft ? supabase.from("authorizations").select("amount_cents,estimates!inner(repair_order_id,status,deleted_at)").eq("estimates.repair_order_id", id).eq("estimates.status", "authorized").is("estimates.deleted_at", null).eq("decision", "approved").is("deleted_at", null) : Promise.resolve({ data: null, error: null }),
  ]);
  if (linesResult.error || shopResult.error || authResult.error || (draft && !shopResult.data)) return <p role="alert">{t("errors.load")}</p>;
  const lines = linesResult.data ?? [];
  const rate = draft ? shopResult.data!.sales_tax_rate : invoice.tax_rate!;
  const totals = draft ? draftInvoiceTotals(lines, rate) : issuedInvoiceTotals(invoice);
  const authorized = draft ? (authResult.data ?? []).reduce((sum, auth) => sum + auth.amount_cents, 0) : invoice.authorized_cents!;
  const summary = <InvoiceSummary totals={totals} rate={rate} authorized={authorized} estimated={draft} />;
  const pdfUrl = `/orders/${id}/invoices/${invoice.id}/pdf`;
  return <section className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1>{t("invoices.title")} <span className="font-mono">{invoice.invoice_number === null ? t("invoice_status.draft") : formatInvoiceNumber(invoice.invoice_number)}</span></h1><div className="mt-2"><StatusBadge variant={invoiceStatusVariants[invoice.status]} label={t(`invoice_status.${invoice.status}`)} /></div></div>
      <Button asChild variant="outline"><Link href={`/orders/${id}`}>{t("invoices.backToOrder", { number: formatRoNumber(order.ro_number) })}</Link></Button>
    </div>
    <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><a href={pdfUrl} target="_blank" rel="noopener noreferrer">{t("invoices.viewPdf")}</a></Button><Button asChild variant="outline"><a href={`${pdfUrl}?download=1`}>{t("invoices.downloadPdf")}</a></Button></div>
    {!draft && !invoice.pdf_document_id && <InvoicePdfRecovery orderId={id} invoiceId={invoice.id} />}
    <div className="space-y-1 rounded-card border border-border bg-surface p-5 sm:p-6">{order.customers && <p className="font-semibold">{customerName(order.customers)}</p>}{order.vehicles && <p>{vehicleLabel(order.vehicles)}</p>}</div>
    {draft ? <InvoiceDraft orderId={id} invoiceId={invoice.id} lines={lines} odometerIn={order.odometer_in} odometerOut={order.odometer_out}>{summary}</InvoiceDraft> : <>
      <dl className="grid gap-4 rounded-card border border-border bg-surface p-5 sm:grid-cols-2 sm:p-6"><div><dt className="text-secondary-foreground">{t("invoices.issuedAt")}</dt><dd className="font-semibold">{formatDateTime(invoice.issued_at!)}</dd></div><div><dt className="text-secondary-foreground">{t("orders.odometerOut")}</dt><dd className="font-semibold">{formatMiles(invoice.odometer_out!)}</dd></div></dl>
      <div className="min-w-0 overflow-x-auto rounded-card border border-border bg-surface"><table className="w-full text-left text-sm"><caption className="sr-only">{t("invoices.lines")}</caption><thead className="bg-muted text-secondary-foreground"><tr>{(["descriptionType", "quantity", "unitPrice", "amount", "taxable"] as const).map(key => <th key={key} scope="col" className="px-4 py-3 font-semibold">{t(`invoices.${key}`)}</th>)}</tr></thead>
        <tbody>{lines.map(line => <tr key={line.id} className="border-t border-border"><td className="min-w-48 px-4 py-3"><p className="whitespace-pre-wrap break-words font-semibold">{line.description}</p><p className="text-secondary-foreground">{t(`estimate_line_type.${line.line_type}`)}</p></td><td className="px-4 py-3">{line.quantity}</td><td className="whitespace-nowrap px-4 py-3 font-mono">{formatMoney(line.unit_price_cents)}</td><td className="whitespace-nowrap px-4 py-3 font-mono">{formatMoney(line.amount_cents ?? 0)}</td><td className="px-4 py-3">{t(line.taxable ? "estimates.yes" : "estimates.no")}</td></tr>)}</tbody></table></div>
      {summary}
      {invoice.notes && <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><h2 className="mb-3">{t("orders.notes")}</h2><p className="whitespace-pre-wrap break-words">{invoice.notes}</p></div>}
      <VoidInvoiceButton orderId={id} invoiceId={invoice.id} />
    </>}
  </section>;
}
