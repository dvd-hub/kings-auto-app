import { formatInTimeZone } from "date-fns-tz";
import { SHOP_TIMEZONE } from "@/lib/config";
import { Constants, type Database } from "@/lib/database.types";
import type { getT } from "@/i18n/server";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadResult = { ok: true; id: string; warning?: string } | {
  ok: false; error?: string; fieldErrors?: Record<string, string>;
  duplicates?: { id: string; name: string }[];
};
export const activeLeadStatuses = ["new", "contacted", "estimate_appt", "estimate_sent"] as const;
export const manualLeadSources = ["phone", "walk_in", "referral", "other"] as const;
export const leadStatusVariants = {
  new: "info", contacted: "info", estimate_appt: "warning", estimate_sent: "warning",
  won: "success", lost: "danger", spam: "neutral",
} as const;
export const shopToday = (now = new Date()) => formatInTimeZone(now, SHOP_TIMEZONE, "yyyy-MM-dd");

export function leadEvent(key: "createdActivity" | "statusActivity" | "callDateActivity" | "appointmentActivity", values: Record<string, string | number> = {}) {
  return JSON.stringify({ module: "leads", key, values });
}

export function leadActivityText(body: string | null, t: Awaited<ReturnType<typeof getT>>): string {
  if (!body) return "";
  try {
    const event = JSON.parse(body);
    if (event?.module !== "leads") return body;
    if (event.key === "statusActivity") {
      const from = Constants.public.Enums.lead_status.find(s => s === event.values?.from);
      const to = Constants.public.Enums.lead_status.find(s => s === event.values?.to);
      if (from && to) return t("leads.statusActivity", { from: t(`leads.status.${from}`), to: t(`leads.status.${to}`) });
    }
    if (event.key === "createdActivity") return t("leads.createdActivity");
    if (event.key === "appointmentActivity") return t(event.values?.linked ? "leads.appointmentActivity" : "leads.appointmentRemovedActivity");
    if (event.key === "callDateActivity") {
      const date = event.values?.date;
      if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return t("leads.callDateActivity", { date: `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}` });
      if (date === "") return t("leads.callDateRemovedActivity");
    }
  } catch { /* Plain notes remain plain notes. */ }
  return body;
}

export function leadError(error: { code?: string; message?: string } | null): string {
  if (error?.code === "23505") return "duplicateLeadRecord";
  if (error?.code === "23503") return "relatedNotFound";
  if (error?.code === "23514") return error.message?.includes("leads_lost_reason_chk") ? "leadLostReason" : "rejectedByRules";
  return "save";
}
