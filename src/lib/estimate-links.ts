import type { Database } from "@/lib/database.types";

export type EstimateLink = Pick<Database["public"]["Tables"]["estimate_links"]["Row"],
  "id" | "recipient_email" | "expires_at" | "sent_at" | "opened_at" | "used_at" | "revoked_at" | "created_at">;

export function estimateLinkStatus(link: EstimateLink, now = Date.now()) {
  if (link.used_at) return "signed";
  if (link.revoked_at) return "revoked";
  if (new Date(link.expires_at).getTime() <= now) return "expired";
  if (link.opened_at) return "opened";
  return link.sent_at ? "sent" : "pending";
}
