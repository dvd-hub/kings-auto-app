import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { SHOP_TIMEZONE } from "@/lib/config";
import type { Database } from "@/lib/database.types";
import { Constants } from "@/lib/database.types";
import type { getT } from "@/i18n/server";

export type RepairOrder = Database["public"]["Tables"]["repair_orders"]["Row"];
export type Estimate = Database["public"]["Tables"]["estimates"]["Row"];
export type EstimateLine = Database["public"]["Tables"]["estimate_lines"]["Row"];
export type EstimateTotals = Database["public"]["Views"]["estimate_totals"]["Row"];
export type OrderStatus = RepairOrder["status"];
export type OrderResult = { ok: true; id: string; warning?: string } | { ok: false; error?: string; fieldErrors?: Record<string, string>; warning?: string };
type Variant = "info" | "warning" | "success" | "danger" | "neutral";

export const editableOrderStatuses = ["open", "in_progress", "completed", "delivered", "cancelled"] as const;
export const roStatusVariants: Record<OrderStatus, Variant> = { open: "info", in_progress: "warning", completed: "success", delivered: "neutral", cancelled: "neutral", total_loss: "danger" };
export const estimateStatusVariants: Record<Estimate["status"], Variant> = { draft: "neutral", sent: "info", authorized: "success", declined: "danger", voided: "neutral" };
export const enumLabelKeys = { ro_status: "ro_status", ro_type: "ro_type", arrival_circumstance: "arrival_circumstance", estimate_kind: "estimate_kind", estimate_status: "estimate_status", estimate_basis: "estimate_basis", estimate_line_type: "estimate_line_type", part_condition: "part_condition", crash_part_origin: "crash_part_origin", labor_type: "labor_type", paint_materials_method: "paint_materials_method", teardown_role: "teardown_role" } as const;

export function estimateEditable(estimate: Pick<Estimate, "kind" | "status" | "locked_at">): boolean {
  return !estimate.locked_at && (estimate.status === "draft" || estimate.status === "sent");
}

export function orderError(error: { code?: string; message?: string; details?: string } | null): string {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (message.includes("is locked")) return "estimateLocked";
  if (message.includes("requires an authorization record")) return "authorizationRequired";
  if (/already.*authoriz|already.*locked/i.test(message)) return "estimateLocked";
  if (error?.code === "23514") {
    const guards: Record<string, string> = { "only supplements have a parent estimate": "supplementParentInvalid", "supplement parent must be an authorized repair estimate of the same order": "supplementParentInvalid", "designee authorization needs a signed designee and a supplement": "designeeNotAllowed", "signed designee cannot be changed": "designeeLocked", "teardown outcome is final": "teardownOutcomeFinal", "teardown outcome needs an authorized teardown estimate": "teardownNotAuthorized", "appointment customer must match the repair order": "appointmentCustomerMismatch" };
    for (const [text, key] of Object.entries(guards)) if (message.includes(text)) return key;
    const constraints: Record<string, string> = { repair_orders_designee_chk: "designeeInvalid", repair_orders_total_loss_chk: "orderInvalid", repair_orders_teardown_outcome_chk: "orderInvalid", estimates_teardown_chk: "teardownFieldsRequired", estimates_third_party_chk: "thirdPartyFieldsRequired", estimates_parent_chk: "supplementNeedsParent", estimate_lines_crash_origin_chk: "crashOriginRequired", estimate_lines_part_required_chk: "partFieldsRequired", documents_path_chk: "documentPath", documents_hash_chk: "documentHash", documents_sha256_check: "documentHash", documents_size_bytes_check: "documentSize", documents_target_chk: "relatedNotFound", authorizations_written_chk: "signatureRequired", authorizations_written_only_chk: "authorizationInvalid", authorizations_oral_chk: "authorizationInvalid", authorizations_electronic_chk: "authorizationContact", authorizations_return_parts_chk: "authorizationInvalid", authorizations_authorizer_name_check: "authorizationName", authorizations_contact_email_check: "authorizationContact", authorizations_contact_phone_check: "authorizationContact", authorizations_phone_called_check: "authorizationContact", estimates_pdf_chk: "documentHash", estimates_pdf_sha256_check: "documentHash" };
    for (const [constraint, key] of Object.entries(constraints)) if (message.includes(constraint)) return key;
    return /repair_orders_/.test(message) ? "orderInvalid" : "rejectedByRules";
  }
  if (error?.code === "23503") return "relatedNotFound";
  if (error?.code === "23505") return message.includes("authorizations") ? "estimateLocked" : message.includes("documents") ? "duplicateDocument" : "duplicateOrderRecord";
  return "save";
}

/** System events retain translation keys so changing language also translates history. */
export function orderEvent(key: string, values: Record<string, string | number>): string {
  return JSON.stringify({ module: "orders", key, values });
}

export function orderActivityText(body: string | null, t: Awaited<ReturnType<typeof getT>>): string {
  if (!body) return "";
  try {
    const event = JSON.parse(body);
    const key = (["createdActivity", "statusActivity", "sentActivity", "estimateEmailedActivity", "voidActivity", "draftActivity", "authorizationActivity", "supplementCreatedActivity", "payorNotifiedActivity", "designeeActivity", "teardownActivity", "pickupNotifiedActivity", "appointmentLinkedActivity", "appointmentUnlinkedActivity", "appointmentCreatedActivity"] as const).find((key) => key === event?.key);
    if (event?.module === "orders" && key && event.values && Object.values(event.values).every((v) => typeof v === "string" || typeof v === "number")) {
      const values = { ...event.values };
      const status = Constants.public.Enums.ro_status.find((s) => s === values.status);
      const kind = Constants.public.Enums.estimate_kind.find((s) => s === values.kind);
      const outcome = (["repair", "reassemble", "declined_reassembly"] as const).find(o => o === values.outcome);
      if (outcome) values.outcome = t(`teardown_outcome.${outcome}`);
      if (status) values.status = t(`ro_status.${status}`);
      if (kind) values.kind = t(`estimate_kind.${kind}`);
      if (key === "authorizationActivity") {
        const decision = (["approved", "declined"] as const).find((d) => d === values.decision);
        const method = (["written", "oral", "electronic"] as const).find((m) => m === values.method);
        if (decision) values.decision = t(`authorization.decision.${decision}`);
        if (method) values.method = t(`authorization.method.${method}`);
      }
      return t(`orders.${key}`, values);
    }
  } catch { /* User notes are plain text. */ }
  return body;
}

export const plainLanguageWarning = /R\s*&\s*[RI]|\bLKQ\b|\bOpt-OEM\b|\bAlt-OEM\b|OEM\s+surplus|shop\s+supplies|\bmisc\b/i;

/** Matches PostgreSQL round(quantity * unit_price_cents), without binary float products. */
export function lineAmount(quantity: string | number, cents: number): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(quantity));
  if (!match) return 0;
  const hundredths = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  return Number((hundredths * BigInt(cents) + BigInt(50)) / BigInt(100));
}

/** Calendar days preserve the shop clock even across daylight-saving transitions. */
export function reassemblyDeadline(authorizedAt: string, days: number): string {
  const wall = new Date(formatInTimeZone(authorizedAt, SHOP_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss") + "Z");
  wall.setUTCDate(wall.getUTCDate() + days);
  return fromZonedTime(wall.toISOString().slice(0, 19), SHOP_TIMEZONE).toISOString();
}
