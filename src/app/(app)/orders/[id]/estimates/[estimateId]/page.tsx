import { notFound } from "next/navigation";
import { z } from "zod";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { customerName } from "@/lib/customers";
import { EstimateBuilder } from "@/components/orders/estimate-builder";

export default async function EstimatePage({ params }: { params: Promise<{ id: string; estimateId: string }> }) {
  const { id, estimateId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(estimateId).success) notFound();
  const t = await getT();
  const supabase = await createClient();
  const [orderResult, estimateResult] = await Promise.all([
    supabase.from("repair_orders").select("*,customers(*)").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("estimates").select("*").eq("id", estimateId).eq("repair_order_id", id).is("deleted_at", null).in("kind", ["teardown", "repair"]).maybeSingle(),
  ]);
  if (orderResult.error || estimateResult.error) return <p role="alert">{t("errors.load")}</p>;
  const order = orderResult.data, estimate = estimateResult.data;
  if (!order || !estimate || !order.customers) notFound();
  const [linesResult, totalsResult, shopResult] = await Promise.all([
    supabase.from("estimate_lines").select("*").eq("estimate_id", estimateId).is("deleted_at", null).order("position").order("id"),
    supabase.from("estimate_totals").select("*").eq("estimate_id", estimateId).maybeSingle(),
    supabase.from("shops").select("epa_id_number").eq("id", order.shop_id).is("deleted_at", null).maybeSingle(),
  ]);
  if (linesResult.error || totalsResult.error || shopResult.error) return <p role="alert">{t("errors.load")}</p>;
  return <EstimateBuilder key={`${estimate.id}:${estimate.updated_at}`} estimate={estimate} lines={linesResult.data ?? []} totals={totalsResult.data} order={order} customer={{ id: order.customers.id, name: customerName(order.customers) }} epaAvailable={Boolean(shopResult.data?.epa_id_number?.trim())} />;
}
