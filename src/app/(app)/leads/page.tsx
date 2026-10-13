import Link from "next/link";
import { Plus } from "lucide-react";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/database.types";
import { activeLeadStatuses, leadStatusVariants, shopToday } from "@/lib/leads";
import { customerName, vehicleLabel } from "@/lib/customers";
import { formatDate, formatPhone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 25;
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string; calls?: string; page?: string }> }) {
  const params = await searchParams;
  const t = await getT();
  const today = shopToday();
  const status = Constants.public.Enums.lead_status.find(s => s === params.status) ?? (params.status === "all" ? "all" : "active");
  const calls = params.calls === "1";
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page ?? "1", 10) || 1));
  const supabase = await createClient();
  let query = supabase.from("leads").select("id,status,source,next_call_on,created_at,summary,customers(type,first_name,last_name,company_name,phone),vehicles(year,make,model,trim)", { count: "exact" }).is("deleted_at", null);
  if (status === "active") query = query.in("status", [...activeLeadStatuses]);
  else if (status !== "all") query = query.eq("status", status);
  if (calls) query = query.lte("next_call_on", today);
  const [result, newLeads] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "new"),
  ]);
  const pages = Math.max(1, Math.ceil((result.count ?? 0) / PAGE_SIZE));
  const href = (p: number) => `/leads?${new URLSearchParams({ status, ...(calls ? { calls: "1" } : {}), page: String(p) })}`;
  return <section className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1>{t("leads.title")}</h1><p className="mt-2 text-secondary-foreground" role="status">{newLeads.error ? t("errors.load") : t("leads.newCount", { count: newLeads.count ?? 0 })}</p></div>
      <Button asChild><Link href="/leads/new"><Plus className="size-4" />{t("leads.new")}</Link></Button>
    </header>
    <form className="flex flex-wrap items-end gap-4 rounded-card border border-border bg-surface p-4">
      <div className="min-w-48"><label htmlFor="lead-filter" className="mb-2 block font-medium">{t("leads.state")}</label>
        <Select id="lead-filter" name="status" defaultValue={status}>
          <option value="active">{t("leads.active")}</option><option value="all">{t("leads.all")}</option>
          {Constants.public.Enums.lead_status.map(s => <option key={s} value={s}>{t(`leads.status.${s}`)}</option>)}
        </Select></div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" name="calls" value="1" defaultChecked={calls} className="size-5" />{t("leads.toCall")}</label>
      <Button type="submit" variant="outline">{t("leads.filter")}</Button>
    </form>
    {result.error ? <p role="alert" className="text-status-danger-text">{t("errors.load")}</p> : <>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <Table><TableHeader><TableRow>{(["customer", "phone", "vehicle", "source", "state", "nextCall", "created"] as const).map(k => <TableHead key={k}>{t(`leads.${k}`)}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{result.data?.map(lead => <TableRow key={lead.id}>
            <TableCell><Link href={`/leads/${lead.id}`} className="inline-flex min-h-11 items-center font-semibold text-link hover:underline">{lead.customers ? customerName(lead.customers) : t("leads.noCustomer")}</Link>
              {lead.summary && <p className="max-w-60 truncate text-sm text-secondary-foreground">{lead.summary}</p>}</TableCell>
            <TableCell>{lead.customers?.phone ? <a href={`tel:${lead.customers.phone}`} className="inline-flex min-h-11 items-center whitespace-nowrap text-link hover:underline">{formatPhone(lead.customers.phone)}</a> : t("leads.notProvided")}</TableCell>
            <TableCell>{lead.vehicles ? vehicleLabel(lead.vehicles) : t("leads.noVehicle")}</TableCell>
            <TableCell>{t(`leads.sources.${lead.source}`)}</TableCell>
            <TableCell><StatusBadge variant={leadStatusVariants[lead.status]} label={t(`leads.status.${lead.status}`)} /></TableCell>
            <TableCell className={lead.next_call_on && lead.next_call_on < today ? "font-semibold text-status-danger-text" : ""}>
              {lead.next_call_on ? <><span className="whitespace-nowrap">{formatDate(`${lead.next_call_on}T12:00:00Z`, "UTC")}</span>{lead.next_call_on < today && <span className="mt-1 block text-xs">{t("leads.overdue")}</span>}</> : t("leads.notProvided")}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(lead.created_at)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {!result.data?.length && <p className="p-6 text-secondary-foreground">{t("leads.empty")}</p>}
      </div>
      <nav aria-label={t("leads.pagination")} className="flex flex-wrap items-center justify-between gap-3">
        <p>{t("leads.page", { page, pages })}</p><div className="flex gap-2">
          {page > 1 && <Button asChild variant="outline"><Link href={href(page - 1)}>{t("leads.previous")}</Link></Button>}
          {page < pages && <Button asChild variant="outline"><Link href={href(page + 1)}>{t("leads.next")}</Link></Button>}
        </div>
      </nav>
    </>}
  </section>;
}
