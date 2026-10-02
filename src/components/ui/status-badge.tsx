import { Badge } from "@/components/ui/badge";
type Status = "info" | "warning" | "success" | "danger" | "neutral";

const styles: Record<Status, string> = {
  info: "bg-status-info-bg text-status-info-text",
  warning: "bg-status-warning-bg text-status-warning-text",
  success: "bg-status-success-bg text-status-success-text",
  danger: "bg-status-danger-bg text-status-danger-text",
  neutral: "bg-status-neutral-bg text-status-neutral-text",
};

export function StatusBadge({ variant, label }: { variant: Status; label: string }) {
  return <Badge variant="outline" className={`border-transparent h-auto inline-flex items-center rounded-badge px-2.5 py-1 text-xs font-semibold ${styles[variant]}`}>{label}</Badge>;
}
