import { formatInTimeZone } from "date-fns-tz";
import { SHOP_TIMEZONE } from "@/lib/config";
import { orderError } from "@/lib/orders";

/** Count shop calendar days, without adding or losing a day at DST changes. */
export function daysInProductionStage(since: string | null, now: Date): number | null {
  if (!since) return null;
  const shopDay = (date: string | Date) => Date.parse(`${formatInTimeZone(date, SHOP_TIMEZONE, "yyyy-MM-dd")}T00:00:00Z`);
  return Math.max(0, Math.round((shopDay(now) - shopDay(since)) / 86_400_000));
}

export function productionError(error: { code?: string; message?: string; details?: string }): string {
  if (error.code === "P0001") {
    const guards: Record<string, string> = {
      "production stage cannot be cleared": "productionStageRequired",
      "production stage can only change on open or in-progress orders": "productionStageOrderInactive",
      "production stage not available": "productionStageUnavailable",
    };
    for (const [message, key] of Object.entries(guards)) if (error.message?.includes(message)) return key;
  }
  return orderError(error);
}
