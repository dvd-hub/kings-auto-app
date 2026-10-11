import { getT } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import { formatTaxRate, type InvoiceTotals } from "@/lib/invoices";

export async function InvoiceSummary({ totals, rate, authorized, estimated }: { totals: InvoiceTotals; rate: number; authorized: number; estimated: boolean }) {
  const t = await getT();
  return <div className="grid gap-4 md:grid-cols-2">
    <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><h2 className="mb-4">{t("invoices.summary")}</h2><dl className="space-y-2">
      {(["parts", "labor", "materials", "sublet", "hazardous", "subtotal", "taxable"] as const).map(key => <div key={key} className="flex justify-between gap-4"><dt className="text-secondary-foreground">{t(`invoices.${key === "taxable" ? "taxableBase" : key}`)}</dt><dd className="font-mono">{formatMoney(totals[key])}</dd></div>)}
      <div className="flex justify-between gap-4"><dt className="text-secondary-foreground">{t(estimated ? "invoices.estimatedTax" : "invoices.tax", { rate: formatTaxRate(rate) })}</dt><dd className="font-mono">{formatMoney(totals.tax)}</dd></div>
      <div className="flex justify-between gap-4 border-t border-border pt-3 font-semibold"><dt>{t("invoices.total")}</dt><dd className="font-mono">{formatMoney(totals.total)}</dd></div>
    </dl>{estimated && <p className="mt-3 text-sm text-secondary-foreground">{t("invoices.estimatedHelp")}</p>}</div>
    <div className="rounded-card border border-border bg-surface p-5 sm:p-6"><h2>{t("invoices.authorizedTotal")}</h2><p className="mt-3 font-mono text-xl font-semibold">{formatMoney(authorized)}</p><p className="mt-2 text-sm text-secondary-foreground">{t("invoices.authorizedHelp")}</p></div>
  </div>;
}
