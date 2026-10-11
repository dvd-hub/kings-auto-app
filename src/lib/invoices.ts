import type { Database } from "@/lib/database.types";
import { lineAmount } from "@/lib/orders";

export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceLine = Database["public"]["Tables"]["invoice_lines"]["Row"];
export type InvoiceTotals = { parts: number; labor: number; materials: number; sublet: number; hazardous: number; taxable: number; subtotal: number; tax: number; total: number };
export const invoiceStatusVariants = { draft: "neutral", issued: "success", voided: "danger" } as const;

/** Preview only. Issued totals always come from invoices, calculated by PostgreSQL. */
export function draftInvoiceTotals(lines: InvoiceLine[], rate: number): InvoiceTotals {
  const totals: InvoiceTotals = { parts: 0, labor: 0, materials: 0, sublet: 0, hazardous: 0, taxable: 0, subtotal: 0, tax: 0, total: 0 };
  for (const line of lines) {
    if (line.deleted_at) continue;
    const amount = line.amount_cents ?? lineAmount(line.quantity, line.unit_price_cents);
    const group = line.line_type === "part" ? "parts" : line.line_type === "paint_materials" || line.line_type === "materials" ? "materials" : line.line_type === "hazardous_waste" ? "hazardous" : line.line_type;
    totals[group] += amount;
    totals.subtotal += amount;
    if (line.taxable) totals.taxable += amount;
  }
  // sales_tax_rate has four decimal places; round half up as PostgreSQL does.
  totals.tax = Number((BigInt(totals.taxable) * BigInt(Math.round(rate * 10000)) + BigInt(5000)) / BigInt(10000));
  totals.total = totals.subtotal + totals.tax;
  return totals;
}

export function issuedInvoiceTotals(invoice: Invoice): InvoiceTotals {
  const parts = invoice.parts_cents ?? 0, labor = invoice.labor_cents ?? 0, materials = invoice.materials_cents ?? 0, sublet = invoice.sublet_cents ?? 0, hazardous = invoice.hazardous_waste_cents ?? 0;
  return { parts, labor, materials, sublet, hazardous, taxable: invoice.taxable_cents ?? 0, subtotal: parts + labor + materials + sublet + hazardous, tax: invoice.tax_cents ?? 0, total: invoice.total_cents ?? 0 };
}

export function formatTaxRate(rate: number): string {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 }).format(rate);
}

export function invoiceError(error: { code?: string; message?: string; details?: string } | null): string {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (error?.code === "P0001") {
    const errors: Record<string, string> = {
      "order already has an invoice": "invoiceAlreadyExists",
      "order has no authorized estimate": "invoiceNoAuthorization",
      "cancelled order cannot be invoiced": "invoiceOrderCancelled",
      "invoice is not a draft": "invoiceNotDraft",
      "invoice has no lines": "invoiceNoLines",
      "invoice exceeds authorized amount": "invoiceExceedsAuthorization",
      "odometer out must be at least odometer in": "invoiceOdometerLow",
      "shop BAR registration number is missing": "invoiceBarMissing",
      "shop EPA number is required for hazardous waste": "invoiceEpaMissing",
      "void reason is required": "invoiceVoidReason",
      "only an issued invoice can be voided": "invoiceNotIssued",
    };
    for (const [text, key] of Object.entries(errors)) if (message.includes(text)) return key;
  }
  if (error?.code === "23514") return message.includes("invoice_lines_cap_chk") ? "invoiceCap" : "rejectedByRules";
  if (error?.code === "23505") return "invoiceAlreadyExists";
  if (error?.code === "P0002" || error?.code === "42501" || error?.code === "23503") return "notFound";
  return "save";
}
