import { notFound } from "next/navigation";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { SHOP_TIMEZONE } from "@/lib/config";
import { formatRoNumber } from "@/lib/format";
import { OrderForm } from "@/components/orders/order-form";
import { OrderTouchTargets } from "@/components/orders/touch-targets";

export async function OrderFormPage({ orderId = null, search }: { orderId?: string | null; search: { customer?: string; vehicle?: string } }) {
  const t = await getT();
  const supabase = await createClient();
  if (orderId && !z.uuid().safeParse(orderId).success) notFound();
  const { data: order, error: orderError } = orderId ? await supabase.from("repair_orders").select("*").eq("id", orderId).is("deleted_at", null).maybeSingle() : { data: null, error: null };
  if (orderError) return <p role="alert">{t("errors.load")}</p>;
  if (orderId && !order) notFound();
  const { count, error: countError } = orderId ? await supabase.from("estimates").select("id", { count: "exact", head: true }).eq("repair_order_id", orderId).is("deleted_at", null).not("status", "in", "(draft,voided)") : { count: 0, error: null };
  if (countError) return <p role="alert">{t("errors.load")}</p>;
  const partiesLocked = Boolean(count);
  const customerId = partiesLocked ? order?.customer_id : search.customer ?? order?.customer_id;
  const { data: customer, error: customerError } = customerId && z.uuid().safeParse(customerId).success ? await supabase.from("customers").select("*").eq("id", customerId).is("deleted_at", null).maybeSingle() : { data: null, error: null };
  const { data: vehicles, error: vehicleError } = customer ? await supabase.from("vehicles").select("*").eq("customer_id", customer.id).is("deleted_at", null).order("created_at") : { data: [], error: null };
  if (customerError || vehicleError) return <p role="alert">{t("errors.load")}</p>;
  const vehicleId = partiesLocked ? order?.vehicle_id : search.vehicle ?? (customerId === order?.customer_id ? order?.vehicle_id : "");
  const vehicle = vehicles?.find((v) => v.id === vehicleId);
  const local = (value: string) => formatInTimeZone(value, SHOP_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
  return <section data-orders-module className="space-y-6"><OrderTouchTargets /><h1>{order ? `${t("orders.edit")} · ${formatRoNumber(order.ro_number)}` : t("orders.new")}</h1>
    {customerId && !customer && <p role="alert" className="text-status-danger-text">{t("errors.relatedNotFound")}</p>}
    <OrderForm orderId={orderId} customer={customer} vehicles={vehicles ?? []} partiesLocked={partiesLocked} initial={{
      customer_id: customer?.id ?? "", vehicle_id: vehicleId ?? "", type: order?.type ?? "standard", odometer_in: order ? String(order.odometer_in) : vehicle?.odometer_mi?.toString() ?? "", odometer_out: order?.odometer_out?.toString() ?? "", requested_repairs: order?.requested_repairs ?? "", arrival_circumstance: order?.arrival_circumstance ?? "customer_present", received_at: local(order?.received_at ?? new Date().toISOString()), promised_at: order?.promised_at ? local(order.promised_at) : "", notes: order?.notes ?? "",
    }} />
  </section>;
}
