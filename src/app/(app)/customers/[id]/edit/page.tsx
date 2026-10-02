import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { CustomerForm } from "@/components/customers/customer-form";
import { formatPhone } from "@/lib/format";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();
  const { data: c } = await supabase.from("customers").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!c) notFound();
  return <section className="mx-auto max-w-3xl space-y-6">
    <h1>{t("customers.editTitle")}</h1>
    <CustomerForm customerId={c.id} initial={{
      type: c.type, first_name: c.first_name ?? "", last_name: c.last_name ?? "", company_name: c.company_name ?? "",
      phone: c.phone ? formatPhone(c.phone) : "", email: c.email ?? "", source: c.source, preferred_language: c.preferred_language,
      address_line1: c.address_line1 ?? "", address_line2: c.address_line2 ?? "", city: c.city ?? "", state: c.state ?? "CA",
      zip: c.zip ?? "", notes: c.notes ?? "",
    }} />
  </section>;
}
