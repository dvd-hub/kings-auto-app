import Link from "next/link";
import { getT } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import { formatTaxRate, type InvoiceTotals } from "@/lib/invoices";
import type { RoBalance } from "@/lib/payments";

export async function InvoiceSummary({ totals, rate, authorized, estimated, balance, orderId }: { totals: InvoiceTotals; rate: number; authorized: number; estimated: boolean; balance?: RoBalance; orderId?: string }) {
  const t = await getT();
  return <div className="grid gap-4 md:grid-cols-2">
    <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><h2 className="mb-4">{t("invoices.summary")}</h2><dl className="space-y-2">
      {(["parts", "labor", "materials", "sublet", "hazardous", "subtotal", "taxable"] as const).map(key => <div key={key} className="flex justify-between gap-4"><dt className="text-secondary-foreground">{t(`invoices.${key === "taxable" ? "taxableBase" : key}`)}</dt><dd className="font-mono">{formatMoney(totals[key])}</dd></div>)}
      <div className="flex justify-between gap-4"><dt className="text-secondary-foreground">{t(estimated ? "invoices.estimatedTax" : "invoices.tax", { rate: formatTaxRate(rate) })}</dt><dd className="font-mono">{formatMoney(totals.tax)}</dd></div>
      <div className="flex justify-between gap-4 border-t border-border pt-3 font-semibold"><dt>{t("invoices.total")}</dt><dd className="font-mono">{formatMoney(totals.total)}</dd></div>
      {!estimated && balance && <><div className="flex justify-between gap-4"><dt>{t("payments.netPaid")}</dt><dd className="font-mono">{formatMoney(balance.net_paid_cents ?? 0)}</dd></div><div className="flex justify-between gap-4 font-semibold"><dt>{t("payments.balance")}</dt><dd className="font-mono">{formatMoney(balance.balance_cents ?? 0)}</dd></div></>}
    </dl>{estimated && <p className="mt-3 text-sm text-secondary-foreground">{t("invoices.estimatedHelp")}</p>}{!estimated && orderId && <Link href={`/orders/${orderId}#payments`} className="mt-3 inline-flex min-h-11 items-center text-link underline">{t("payments.viewPayments")}</Link>}</div>
    <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("invoices.authorizedTotal")}</h2><p className="mt-3 font-mono text-xl font-semibold">{formatMoney(authorized)}</p><p className="mt-2 text-sm text-secondary-foreground">{t("invoices.authorizedHelp")}</p></div>
  </div>;
}
