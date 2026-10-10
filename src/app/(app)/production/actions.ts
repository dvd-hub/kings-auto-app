"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { productionStageSchema } from "@/lib/validation";
import { orderEvent, type OrderResult } from "@/lib/orders";
import { productionError } from "@/lib/production";

export async function moveProductionStage(input: unknown): Promise<OrderResult> {
  const parsed = productionStageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "productionStageRequired" };
  const supabase = await createClient();
  if (!(await supabase.auth.getUser()).data.user) return { ok: false, error: "notFound" };
  const [{ data: order, error: orderError }, { data: stages, error: stagesError }] = await Promise.all([
    supabase.from("repair_orders").select("id,customer_id,status,production_stage_id,updated_at").eq("id", parsed.data.id).is("deleted_at", null).maybeSingle(),
    supabase.from("production_stages").select("id,name").is("deleted_at", null).order("position").order("created_at").order("id"),
  ]);
  if (orderError || stagesError) return { ok: false, error: productionError(orderError ?? stagesError!) };
  if (!order) return { ok: false, error: "notFound" };
  if (order.status !== "open" && order.status !== "in_progress") return { ok: false, error: "productionStageOrderInactive" };
  const currentIndex = stages!.findIndex((stage) => stage.id === order.production_stage_id);
  const targetIndex = stages!.findIndex((stage) => stage.id === parsed.data.production_stage_id);
  if (currentIndex < 0 || targetIndex < 0) return { ok: false, error: "productionStageUnavailable" };
  if (currentIndex === targetIndex) return { ok: true, id: order.id };
  if (Math.abs(currentIndex - targetIndex) !== 1) return { ok: false, error: "changedElsewhere" };

  const { data: updated, error } = await supabase.from("repair_orders")
    .update({ production_stage_id: parsed.data.production_stage_id })
    .eq("id", order.id).is("deleted_at", null).eq("updated_at", order.updated_at)
    .in("status", ["open", "in_progress"]).select("id").maybeSingle();
  if (error || !updated) return { ok: false, error: error ? productionError(error) : "changedElsewhere" };
  const { error: activityError } = await supabase.from("activities").insert({
    repair_order_id: order.id,
    customer_id: order.customer_id,
    kind: "system",
    body: orderEvent("stageActivity", { from: stages![currentIndex].name, to: stages![targetIndex].name }),
  });
  revalidatePath("/production");
  revalidatePath(`/orders/${order.id}`);
  return { ok: true, id: order.id, ...(activityError ? { warning: "historySave" } : {}) };
}
