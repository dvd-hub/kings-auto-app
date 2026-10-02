import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { ArchiveButton } from "@/components/archive-button";
import { archiveVehicle } from "@/app/(app)/vehicles/actions";
import { customerName } from "@/lib/customers";

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const supabase = await createClient();
  const { data: v } = await supabase.from("vehicles").select("*, customers(id, type, first_name, last_name, company_name)")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (!v) notFound();
  const archive = archiveVehicle.bind(null, v.id);
  return <section className="mx-auto max-w-3xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1>{t("vehicles.editTitle")}</h1>
        {v.customers && <p className="mt-2 text-secondary-foreground">{t("vehicles.forCustomer", { name: customerName(v.customers) })}</p>}
      </div>
      <ArchiveButton title={t("vehicles.archiveTitle")} text={t("vehicles.archiveText")} done={t("vehicles.archived")}
        redirectTo={`/customers/${v.customer_id}`} action={archive} />
    </div>
    <VehicleForm vehicleId={v.id} customerId={v.customer_id} initial={{
      vin: v.vin ?? "", year: v.year ? String(v.year) : "", make: v.make ?? "", model: v.model ?? "", trim: v.trim ?? "",
      color: v.color ?? "", plate: v.plate ?? "", plate_state: v.plate_state ?? "CA",
      odometer_mi: v.odometer_mi !== null ? String(v.odometer_mi) : "", notes: v.notes ?? "",
    }} />
  </section>;
}
