import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { customerName } from "@/lib/customers";

export default async function NewVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("id, type, first_name, last_name, company_name").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!customer) notFound();
  return <section className="mx-auto max-w-3xl space-y-6">
    <div>
      <h1>{t("vehicles.newTitle")}</h1>
      <p className="mt-2 text-secondary-foreground">{t("vehicles.forCustomer", { name: customerName(customer) })}</p>
    </div>
    <VehicleForm vehicleId={null} customerId={customer.id} initial={{
      vin: "", year: "", make: "", model: "", trim: "", color: "", plate: "", plate_state: "CA", odometer_mi: "", notes: "",
    }} />
  </section>;
}
