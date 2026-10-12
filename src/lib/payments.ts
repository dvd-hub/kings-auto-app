import type { Database } from "@/lib/database.types";
import type { OrderResult } from "@/lib/orders";

export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type RoBalance = Database["public"]["Views"]["ro_balances"]["Row"];
export type PaymentResult = OrderResult | { ok: false; error: "paymentOverpaymentConfirmation"; overpaymentCents: number };
export const paymentStatusVariants = {
  no_invoice: "neutral", deposit: "info", unpaid: "danger", partial: "warning", paid: "success", overpaid: "warning",
} as const;
export type BalanceStatus = keyof typeof paymentStatusVariants;

export function balanceStatus(value: string | null): BalanceStatus | null {
  return value && Object.hasOwn(paymentStatusVariants, value) ? value as BalanceStatus : null;
}

export function paymentError(error: { code?: string; message?: string; details?: string } | null): string {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (error?.code === "P0001") {
    const errors: Record<string, string> = {
      "payment amount must be positive": "paymentPositive",
      "payment date cannot be in the future": "paymentFutureDate",
      "insurance payment requires payer name": "paymentPayerName",
      "cancelled order cannot receive payments": "paymentCancelledOrder",
      "refund exceeds amount paid": "paymentRefundExceeded",
      "payment already voided": "paymentAlreadyVoided",
      "void reason is required": "paymentVoidReason",
      "void would leave refunds above payments": "paymentVoidRefunds",
    };
    for (const [text, key] of Object.entries(errors)) if (message.includes(text)) return key;
    return "rejectedByRules";
  }
  if (error?.code === "23514") return message.includes("payments_reference_check") ? "paymentReference" : "rejectedByRules";
  if (error?.code === "P0002" || error?.code === "42501") return "notFound";
  if (error?.code === "23505") return "duplicateOrderRecord";
  if (error?.code === "23503") return "relatedNotFound";
  return "save";
}
