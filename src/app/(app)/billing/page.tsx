import Link from "next/link";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { customerName, vehicleLabel, type Customer, type Vehicle } from "@/lib/customers";
import { formatInvoiceNumber, formatMoney, formatRoNumber } from "@/lib/format";
import { balanceStatus, paymentStatusVariants } from "@/lib/payments";
import { getBillingBalances, totalPending } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

type BillingOrder = { id: string; ro_number: number; customers: Customer | null; vehicles: Vehicle | null };
const filters = { receivable: ["unpaid", "partial"], overpaid: ["overpaid"], deposit: ["deposit"] } as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const search = await searchParams;
  const selected = search.status === "overpaid" || search.status === "deposit" ? search.status : "receivable";
  const t = await getT();
  const supabase = await createClient();
  const balanceResult = await getBillingBalances(supabase);
  if (balanceResult.error) return <p role="alert">{t("errors.load")}</p>;
  const balances = balanceResult.data;
  const rows = balances.filter(row => (filters[selected] as readonly string[]).includes(row.payment_status ?? ""));
  const pending = totalPending(balances);
  const orders = new Map<string, BillingOrder>();
  const invoiceNumbers = new Map<string, number | null>();
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const orderIds = batch.flatMap(row => row.repair_order_id ? [row.repair_order_id] : []);
    const invoiceIds = batch.flatMap(row => row.invoice_id ? [row.invoice_id] : []);
    const [orderResult, invoiceResult] = await Promise.all([
      supabase.from("repair_orders").select("id,ro_number,customers(*),vehicles(*)").in("id", orderIds).is("deleted_at", null),
      invoiceIds.length ? supabase.from("invoices").select("id,invoice_number").in("id", invoiceIds).eq("status", "issued").is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
    ]);
    if (orderResult.error || invoiceResult.error) return <p role="alert">{t("errors.load")}</p>;
    for (const order of orderResult.data ?? []) orders.set(order.id, order);
    for (const invoice of invoiceResult.data ?? []) invoiceNumbers.set(invoice.id, invoice.invoice_number);
  }
  rows.sort((a, b) => (orders.get(b.repair_order_id ?? "")?.ro_number ?? 0) - (orders.get(a.repair_order_id ?? "")?.ro_number ?? 0));
  return <section className="min-w-0 space-y-5">
    <h1>{t("billing.title")}</h1>
    <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><p className="text-secondary-foreground">{t("billing.totalPending")}</p><p className="mt-2 font-mono text-2xl font-semibold">{formatMoney(pending)}</p></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("billing.filterStatus")}>{(Object.keys(filters) as (keyof typeof filters)[]).map(filter => <Button asChild variant="outline" key={filter} className={selected === filter ? "border-foreground bg-muted" : ""}><Link href={`/billing?status=${filter}`} aria-current={selected === filter ? "page" : undefined}>{t(`billing.filters.${filter}`)}</Link></Button>)}</div>
    {rows.length === 0 ? <p className="text-secondary-foreground">{t("billing.empty")}</p> : <div className="overflow-x-auto rounded-card border border-border bg-surface"><table className="w-full text-left text-sm"><caption className="sr-only">{t("billing.title")}</caption>
      <thead className="bg-muted text-secondary-foreground"><tr>{(["ro", "customer", "vehicle", "invoice", "total", "paid", "balance", "status"] as const).map(key => <th key={key} scope="col" className="px-4 py-3 font-semibold">{t(`billing.${key}`)}</th>)}</tr></thead>
      <tbody>{rows.map(row => {
        const order = orders.get(row.repair_order_id ?? "");
        const number = invoiceNumbers.get(row.invoice_id ?? "");
        const status = balanceStatus(row.payment_status);
        return <tr key={row.repair_order_id} className="border-t border-border hover:bg-muted">
          <td className="px-4 py-2">{order ? <Link href={`/orders/${order.id}#payments`} className="inline-flex min-h-11 items-center whitespace-nowrap font-mono font-semibold text-link underline">{formatRoNumber(order.ro_number)}</Link> : t("common.none")}</td>
          <td className="min-w-40 px-4 py-3">{order?.customers ? customerName(order.customers) : t("common.none")}</td>
          <td className="min-w-48 px-4 py-3">{order?.vehicles ? vehicleLabel(order.vehicles) : t("common.none")}</td>
          <td className="whitespace-nowrap px-4 py-3 font-mono">{number != null ? formatInvoiceNumber(number) : t("common.none")}</td>
          <td className="whitespace-nowrap px-4 py-3 font-mono">{row.invoice_total_cents !== null ? formatMoney(row.invoice_total_cents) : t("common.none")}</td>
          <td className="whitespace-nowrap px-4 py-3 font-mono">{formatMoney(row.net_paid_cents ?? 0)}</td>
          <td className="whitespace-nowrap px-4 py-3 font-mono">{row.balance_cents !== null ? formatMoney(row.balance_cents) : t("common.none")}</td>
          <td className="px-4 py-3">{status && <StatusBadge variant={paymentStatusVariants[status]} label={t(`payments.status.${status}`)} />}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </section>;
}
