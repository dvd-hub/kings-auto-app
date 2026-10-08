"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatRoNumber } from "@/lib/format";
import { roStatusVariants, type RepairOrder } from "@/lib/orders";
import { customerName, vehicleLabel, type Customer, type Vehicle } from "@/lib/customers";

export type OrderListRow = RepairOrder & { customers: Customer | null; vehicles: Vehicle | null };
export function OrderList({ rows }: { rows: OrderListRow[] }) {
  const t = useTranslations();
  const router = useRouter();
  const status = (row: RepairOrder) => <StatusBadge variant={roStatusVariants[row.status]} label={t(`ro_status.${row.status}`)} />;
  if (!rows.length) return <p className="rounded-card border border-border bg-surface p-6 text-secondary-foreground">{t("orders.empty")}</p>;
  return <>
    <div className="hidden overflow-hidden rounded-card border border-border bg-surface xl:block"><table className="w-full table-fixed text-left">
      <thead className="border-b border-border bg-muted/50"><tr>{["ro", "customer", "vehicle", "status", "received", "promised"].map((key) => <th key={key} className="px-4 py-3 font-semibold">{t(`orders.${key}`)}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} role="link" tabIndex={0} aria-label={formatRoNumber(row.ro_number)} className="cursor-pointer border-b border-border last:border-0 hover:bg-app-bg focus-visible:bg-muted" onClick={() => router.push(`/orders/${row.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(`/orders/${row.id}`); } }}>
        <td className="px-4 py-4 font-mono font-semibold">{formatRoNumber(row.ro_number)}</td><td className="break-words px-4 py-4">{row.customers && customerName(row.customers)}</td><td className="break-words px-4 py-4">{row.vehicles && vehicleLabel(row.vehicles)}</td><td className="px-4 py-4">{status(row)}</td><td className="px-4 py-4">{formatDate(row.received_at)}</td><td className="px-4 py-4">{row.promised_at ? formatDate(row.promised_at) : t("common.none")}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="grid gap-3 md:grid-cols-2 xl:hidden">{rows.map((row) => <Link href={`/orders/${row.id}`} key={row.id} className="min-w-0 space-y-2 rounded-card border border-border bg-surface p-5 hover:bg-muted">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-lg font-semibold">{formatRoNumber(row.ro_number)}</span>{status(row)}</div>
      <p className="break-words font-semibold">{row.customers && customerName(row.customers)}</p><p className="break-words text-secondary-foreground">{row.vehicles && vehicleLabel(row.vehicles)}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-secondary-foreground">{t("orders.received")}</dt><dd>{formatDate(row.received_at)}</dd></div><div><dt className="text-secondary-foreground">{t("orders.promised")}</dt><dd>{row.promised_at ? formatDate(row.promised_at) : t("common.none")}</dd></div></dl>
    </Link>)}</div>
  </>;
}
