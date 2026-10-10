import Link from "next/link";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { customerName, vehicleLabel } from "@/lib/customers";
import { formatDateTime, formatRoNumber } from "@/lib/format";
import { roStatusVariants } from "@/lib/orders";
import { daysInProductionStage } from "@/lib/production";
import { StatusBadge } from "@/components/ui/status-badge";
import { StageControls } from "@/components/production/stage-controls";
import { BoardScroller } from "@/components/production/board-scroller";

export default async function ProductionPage() {
  const t = await getT();
  const supabase = await createClient();
  const [stageResult, orderResult] = await Promise.all([
    supabase.from("production_stages").select("id,name").is("deleted_at", null).order("position").order("created_at").order("id"),
    supabase.from("repair_orders").select("id,ro_number,status,production_stage_id,production_stage_at,promised_at,customers(type,first_name,last_name,company_name),vehicles(year,make,model,trim)")
      .is("deleted_at", null).in("status", ["open", "in_progress"])
      .order("production_stage_at", { ascending: true, nullsFirst: false }).order("ro_number"),
  ]);
  const now = new Date();
  const stages = stageResult.data ?? [];
  const orders = orderResult.data ?? [];
  return <section className="min-w-0 space-y-5">
    <h1>{t("production.title")}</h1>
    {stageResult.error || orderResult.error
      ? <p role="alert" className="text-status-danger-text">{t("errors.load")}</p>
      : !stages.length
        ? <p className="rounded-card border border-border bg-surface p-6 text-secondary-foreground">{t("production.noStages")}</p>
        : <BoardScroller>
          <div className="grid grid-flow-col auto-cols-[minmax(14rem,1fr)] items-start gap-3">
            {stages.map((stage, index) => {
              const rows = orders.filter((order) => order.production_stage_id === stage.id);
              return <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className="min-w-0 rounded-card border border-border bg-muted/50">
                <header className="flex items-center justify-between gap-3 border-b border-border p-4">
                  <h2 id={`stage-${stage.id}`} className="min-w-0 break-words">{stage.name}</h2>
                  <span className="shrink-0 rounded-badge bg-status-neutral-bg px-2.5 py-1 text-sm font-semibold text-status-neutral-text"
                    aria-label={t("production.vehicleCount", { count: rows.length })}>{rows.length}</span>
                </header>
                <div className="space-y-3 p-3">
                  {!rows.length && <p className="py-6 text-center text-secondary-foreground">{t("production.noVehicles")}</p>}
                  {rows.map((order) => {
                    const ro = formatRoNumber(order.ro_number);
                    const days = daysInProductionStage(order.production_stage_at, now);
                    const late = order.promised_at !== null && Date.parse(order.promised_at) < now.getTime();
                    return <article key={order.id} className="overflow-hidden rounded-card border border-border bg-surface">
                      <Link href={`/orders/${order.id}`} className="block space-y-3 p-4 hover:bg-app-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono font-semibold">{ro}</span>
                          <StatusBadge variant={roStatusVariants[order.status]} label={t(`ro_status.${order.status}`)} />
                        </div>
                        <p className="break-words font-semibold">{order.vehicles ? vehicleLabel(order.vehicles) : t("common.none")}</p>
                        <p className="break-words text-secondary-foreground">{order.customers ? customerName(order.customers) : t("common.none")}</p>
                        <p className="text-sm text-secondary-foreground">{days === null ? t("production.stageTimeUnknown") : t("production.daysInStage", { count: days })}</p>
                        {order.promised_at && <div className="space-y-1 text-sm">
                          <p className={late ? "text-status-danger-text" : "text-secondary-foreground"}>
                            {t("production.promised", { date: formatDateTime(order.promised_at) })}
                          </p>
                          {late && <StatusBadge variant="danger" label={t("production.late")} />}
                        </div>}
                      </Link>
                      <StageControls orderId={order.id} ro={ro} previous={stages[index - 1] ?? null} next={stages[index + 1] ?? null} />
                    </article>;
                  })}
                </div>
              </section>;
            })}
          </div>
        </BoardScroller>}
  </section>;
}
