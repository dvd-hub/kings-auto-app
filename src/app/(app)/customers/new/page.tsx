import { getT } from "@/i18n/server";
import { CustomerForm } from "@/components/customers/customer-form";

function prefill(q: string) {
  const empty = { first_name: "", last_name: "", phone: "", email: "" };
  if (!q) return empty;
  if (q.includes("@")) return { ...empty, email: q };
  if (/^[\d\s()+.-]+$/.test(q)) return { ...empty, phone: q };
  const [first, ...rest] = q.split(/\s+/);
  return { ...empty, first_name: first, last_name: rest.join(" ") };
}

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getT();
  const q = ((await searchParams).q ?? "").trim().slice(0, 120);
  return <section className="mx-auto max-w-3xl space-y-6">
    <h1>{t("customers.newTitle")}</h1>
    <CustomerForm customerId={null} initial={{
      type: "individual", company_name: "", source: "", preferred_language: "en",
      address_line1: "", address_line2: "", city: "", state: "CA", zip: "", notes: "", ...prefill(q),
    }} />
  </section>;
}
