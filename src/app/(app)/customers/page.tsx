import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { customerName, type Customer } from "@/lib/customers";
import { formatDate, formatPhone } from "@/lib/format";

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const t = await getT();
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const supabase = await createClient();

  let rows: Customer[] = [];
  let total = 0;
  let failed = false;
  const searching = q.length >= 2;
  if (searching) {
    const { data, error } = await supabase.rpc("search_customers", { q });
    failed = Boolean(error);
    total = data?.length ?? 0;
    rows = (data ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    const { data, count, error } = await supabase.from("customers").select("*", { count: "exact" })
      .is("deleted_at", null).order("updated_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    failed = Boolean(error);
    rows = data ?? [];
    total = count ?? 0;
  }

  const vehicleCounts = new Map<string, number>();
  if (rows.length > 0) {
    const { data } = await supabase.from("vehicles").select("customer_id").is("deleted_at", null).in("customer_id", rows.map((r) => r.id));
    data?.forEach((v) => vehicleCounts.set(v.customer_id, (vehicleCounts.get(v.customer_id) ?? 0) + 1));
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1>{t("customers.title")}</h1>
      <Button asChild><Link href="/customers/new"><Plus className="size-5" />{t("customers.new")}</Link></Button>
    </div>

    <form action="/customers" className="flex flex-wrap gap-2" role="search">
      <Input name="q" type="search" defaultValue={q} aria-label={t("customers.filter")} placeholder={t("navigation.searchPlaceholder")} className="max-w-md flex-1 bg-surface" />
      <Button type="submit" variant="outline">{t("customers.filterButton")}</Button>
      {q && <Button asChild variant="ghost"><Link href="/customers">{t("customers.clearFilter")}</Link></Button>}
    </form>

    <div className="rounded-card border border-border bg-surface">
      {failed ? <p role="alert" className="p-6 text-status-danger-text">{t("errors.load")}</p>
        : rows.length === 0 ? <p className="p-6 text-secondary-foreground">{q ? t("customers.noMatches") : t("customers.empty")}</p>
        : <Table className="text-[15px]">
          <TableHeader><TableRow>
            <TableHead className="px-4">{t("customers.name")}</TableHead>
            <TableHead>{t("customers.phone")}</TableHead>
            <TableHead>{t("customers.email")}</TableHead>
            <TableHead className="text-right">{t("customers.vehicles")}</TableHead>
            <TableHead>{t("customers.source")}</TableHead>
            <TableHead className="px-4">{t("customers.updated")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((c) => <TableRow key={c.id}>
              <TableCell className="px-4"><Link href={`/customers/${c.id}`} className="inline-flex min-h-11 items-center font-semibold text-link hover:text-link-hover hover:underline">{customerName(c)}</Link></TableCell>
              <TableCell>{c.phone ? formatPhone(c.phone) : "—"}</TableCell>
              <TableCell>{c.email ?? "—"}</TableCell>
              <TableCell className="text-right">{vehicleCounts.get(c.id) ?? 0}</TableCell>
              <TableCell>{t(`customerSource.${c.source}`)}</TableCell>
              <TableCell className="px-4">{formatDate(c.updated_at)}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>}
    </div>

    {searching && total >= 20 && <p className="text-sm text-secondary-foreground">{t("customers.searchLimit")}</p>}
    {pages > 1 && <nav className="flex items-center justify-between gap-3" aria-label={t("customers.title")}>
      {page > 1 ? <Button asChild variant="outline"><Link href={pageHref(page - 1)}>{t("common.previous")}</Link></Button> : <span />}
      <span className="text-secondary-foreground">{t("common.page", { page, total: pages })}</span>
      {page < pages ? <Button asChild variant="outline"><Link href={pageHref(page + 1)}>{t("common.next")}</Link></Button> : <span />}
    </nav>}
  </section>;
}
