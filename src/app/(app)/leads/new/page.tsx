import { z } from "zod";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { activeLeadStatuses } from "@/lib/leads";
import { LeadNewForm } from "@/components/leads/lead-new-form";

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer: id } = await searchParams;
  const t = await getT();
  const supabase = await createClient();
  const { data: customer, error } = id && z.uuid().safeParse(id).success
    ? await supabase.from("customers").select("id,type,first_name,last_name,company_name,phone,email").eq("id", id).is("deleted_at", null).maybeSingle()
    : { data: null, error: null };
  const [vehicles, leads] = customer ? await Promise.all([
    supabase.from("vehicles").select("id,year,make,model,trim").eq("customer_id", customer.id).is("deleted_at", null).order("created_at"),
    supabase.from("leads").select("id,summary,status", { count: "exact" }).eq("customer_id", customer.id).is("deleted_at", null).in("status", [...activeLeadStatuses]).order("created_at", { ascending: false }).limit(5),
  ]) : [{ data: [], error: null }, { data: [], count: 0, error: null }];
  return <section className="max-w-3xl space-y-6"><h1>{t("leads.new")}</h1>
    {error || vehicles.error || leads.error ? <p role="alert">{t("errors.load")}</p> : <>
      {id && !customer && <p role="alert" className="text-status-danger-text">{t("errors.relatedNotFound")}</p>}
      <LeadNewForm customer={customer} vehicles={vehicles.data ?? []} openLeads={leads.data ?? []} openCount={leads.count ?? 0} />
    </>}
  </section>;
}
