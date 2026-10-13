import Link from "next/link";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import { leadStatusVariants } from "@/lib/leads";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

export async function CustomerLeads({ customerId }: { customerId: string }) {
  const t = await getT(); const supabase = await createClient();
  const result = await readAll((start, end) => supabase.from("leads").select("id,summary,status,created_at").eq("customer_id", customerId).is("deleted_at", null).order("created_at", { ascending: false }).order("id").range(start, end));
  return <section className="rounded-card border border-border bg-surface p-6"><header className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2>{t("leads.title")}</h2><Button asChild variant="outline"><Link href={`/leads/new?customer=${customerId}`}>{t("leads.new")}</Link></Button></header>
    {result.error ? <p role="alert">{t("errors.load")}</p> : !result.data.length ? <p className="text-secondary-foreground">{t("leads.customerEmpty")}</p> : <ul className="divide-y divide-border">{result.data.map(lead => <li key={lead.id}><Link href={`/leads/${lead.id}`} className="flex min-h-11 flex-wrap items-center gap-3 py-3"><StatusBadge variant={leadStatusVariants[lead.status]} label={t(`leads.status.${lead.status}`)} /><span className="min-w-0 flex-1 break-words font-semibold text-link">{lead.summary || t("leads.detail")}</span><span className="text-sm text-secondary-foreground">{formatDate(lead.created_at)}</span></Link></li>)}</ul>}
  </section>;
}
