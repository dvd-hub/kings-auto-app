import Link from "next/link";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatInvoiceNumber, formatMoney, formatDateTime } from "@/lib/format";
import { draftInvoiceTotals, invoiceStatusVariants } from "@/lib/invoices";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { CreateInvoiceButton } from "@/components/orders/invoice-controls";

export async function OrderInvoice({ orderId, authorized, estimatesFailed }: { orderId: string; authorized: boolean; estimatesFailed: boolean }) {
  const t = await getT();
  const supabase = await createClient();
  const { data: invoices, error } = await supabase.from("invoices").select("*").eq("repair_order_id", orderId).is("deleted_at", null).order("created_at", { ascending: false });
  const active = invoices?.find(invoice => invoice.status !== "voided");
  const history = invoices?.filter(invoice => invoice.status === "voided") ?? [];
  let total = active?.total_cents ?? 0, previewFailed = false;
  if (active?.status === "draft") {
    const [lines, shop] = await Promise.all([
      supabase.from("invoice_lines").select("*").eq("invoice_id", active.id).is("deleted_at", null),
      supabase.from("shops").select("sales_tax_rate").eq("id", active.shop_id).is("deleted_at", null).maybeSingle(),
    ]);
    previewFailed = Boolean(lines.error || shop.error || !shop.data);
    if (!previewFailed) total = draftInvoiceTotals(lines.data ?? [], shop.data!.sales_tax_rate).total;
  }
  return <section className="space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("invoices.title")}</h2>
    {error || previewFailed ? <p role="alert">{t("errors.load")}</p> : active ? <div className="flex flex-wrap items-center gap-4">
      <span className="font-mono font-semibold">{active.invoice_number === null ? t("invoice_status.draft") : formatInvoiceNumber(active.invoice_number)}</span>
      <StatusBadge variant={invoiceStatusVariants[active.status]} label={t(`invoice_status.${active.status}`)} /><span className="font-mono">{formatMoney(total)}</span>
      <Button asChild variant="outline"><Link href={`/orders/${orderId}/invoice`}>{t("invoices.view")}</Link></Button>
    </div> : <div className="flex flex-wrap items-center gap-4"><p className="text-secondary-foreground">{t("invoices.noInvoice")}</p>{estimatesFailed ? <p role="alert">{t("errors.load")}</p> : authorized && <CreateInvoiceButton orderId={orderId} />}</div>}
    {history.length > 0 && <div className="border-t border-border pt-4"><h3 className="mb-3 font-heading font-semibold">{t("invoices.voidedHistory")}</h3><ul className="divide-y divide-border">{history.map(invoice => <li key={invoice.id} className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-3"><span className="font-mono font-semibold">{formatInvoiceNumber(invoice.invoice_number!)}</span><StatusBadge variant="danger" label={t("invoice_status.voided")} /><span className="font-mono">{formatMoney(invoice.total_cents ?? 0)}</span>{invoice.voided_at && <span className="text-sm text-secondary-foreground">{formatDateTime(invoice.voided_at)}</span>}</div>
      <p className="whitespace-pre-wrap break-words text-sm text-secondary-foreground">{invoice.void_reason}</p>
      <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><a href={`/orders/${orderId}/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">{t("invoices.viewPdf")}</a></Button><Button asChild variant="outline"><a href={`/orders/${orderId}/invoices/${invoice.id}/pdf?download=1`}>{t("invoices.downloadPdf")}</a></Button></div>
    </li>)}</ul></div>}
  </section>;
}
