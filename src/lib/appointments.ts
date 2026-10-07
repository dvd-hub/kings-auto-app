import type { Database } from "@/lib/database.types";

type AppointmentType = Database["public"]["Enums"]["appointment_type"];
type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
type Variant = "info" | "warning" | "success" | "danger" | "neutral";

const typeVariants: Record<AppointmentType, Variant> = {
  estimate: "info", drop_off: "warning", delivery: "success", pickup: "success", other: "neutral",
};

/** Cancelled appointments are always shown in grey. */
export function appointmentTypeVariant(type: AppointmentType, status: AppointmentStatus = "scheduled"): Variant {
  return status === "cancelled" ? "neutral" : typeVariants[type];
}

export function appointmentStatusVariant(status: AppointmentStatus): Variant {
  return status === "requested" ? "warning" : status === "completed" ? "success" : status === "no_show" ? "danger" : status === "cancelled" ? "neutral" : "info";
}

export const appointmentBlockClass: Record<Variant, string> = {
  info: "bg-status-info-bg text-status-info-text border-status-info-text",
  warning: "bg-status-warning-bg text-status-warning-text border-status-warning-text",
  success: "bg-status-success-bg text-status-success-text border-status-success-text",
  danger: "bg-status-danger-bg text-status-danger-text border-status-danger-text",
  neutral: "bg-status-neutral-bg text-status-neutral-text border-status-neutral-text",
};
