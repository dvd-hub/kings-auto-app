"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const controlClass = "min-h-11 w-full min-w-0 rounded-control border border-input bg-input-bg px-3 py-2 text-[15px] text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50";

export function Field({ id, label, error, hint, warning, className, children }: {
  id: string; label: string; error?: string; hint?: string; warning?: string; className?: string; children: React.ReactNode;
}) {
  const v = useTranslations("validation");
  return <div className={className}>
    <Label htmlFor={id} className="mb-1.5">{label}</Label>
    {children}
    {hint && !error && <p id={`${id}-hint`} className="mt-1 text-sm text-secondary-foreground">{hint}</p>}
    {warning && !error && <p role="status" className="mt-1 rounded-control bg-status-warning-bg px-2 py-1 text-sm font-medium text-status-warning-text">{warning}</p>}
    {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-medium text-status-danger-text">{v.has(error) ? v(error as "required") : error}</p>}
  </div>;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(controlClass, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(controlClass, "min-h-24", className)} {...props} />;
}

/** aria props for a control inside <Field>. */
export function fieldAria(id: string, error?: string) {
  return { id, name: id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined };
}
