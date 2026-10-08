import Link from "next/link";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrderList } from "@/components/orders/order-list";
import { OrderTouchTargets } from "@/components/orders/touch-targets";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const search = await searchParams;
  const t = await getT();
  const supabase = await createClient();
  const statuses = Constants.public.Enums.ro_status;
  const filters = ["active", ...statuses, "all"] as const;
  const selected = statuses.find((value) => value === search.status) ?? (search.status === "all" ? "all" : "active");
  const q = search.q?.trim() ?? "";
  let query = supabase.from("repair_orders").select("*,customers!inner(*),vehicles(*)").is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  if (selected === "active") query = query.in("status", ["open", "in_progress", "completed"]);
  else if (selected !== "all") query = query.eq("status", selected);
  if (q) {
    const number = /^(?:RO-)?(\d+)$/i.exec(q);
    if (number) query = query.eq("ro_number", Number(number[1]));
    else query = query.ilike("customers.search_text", `%${q.replace(/[\\%_]/g, "\\$&")}%`).is("customers.deleted_at", null);
  }
  const { data, error } = await query;
  return <section data-orders-module className="space-y-5"><OrderTouchTargets />
    <div className="flex flex-wrap items-center justify-between gap-3"><h1>{t("orders.title")}</h1><Button asChild><Link href="/orders/new">{t("orders.new")}</Link></Button></div>
    <form className="flex flex-wrap gap-2" action="/orders"><input type="hidden" name="status" value={selected} /><Input name="q" type="search" defaultValue={q} aria-label={t("orders.search")} placeholder={t("orders.search")} className="w-full sm:max-w-md" /><Button variant="outline">{t("orders.searchButton")}</Button></form>
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("orders.filterStatus")}>
      {filters.map((status) => <Button asChild variant="outline" key={status} className={selected === status ? "border-foreground bg-muted" : ""}><Link aria-current={selected === status ? "page" : undefined} href={`/orders?${new URLSearchParams({ status, ...(q ? { q } : {}) })}`}>{t(status === "active" ? "orders.active" : status === "all" ? "orders.all" : `ro_status.${status}`)}</Link></Button>)}
    </div>
    {error ? <p role="alert" className="text-status-danger-text">{t("errors.load")}</p> : <OrderList rows={data ?? []} />}
  </section>;
}
