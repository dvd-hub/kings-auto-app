import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Constants } from "@/lib/database.types";
import { normalizeVin } from "@/lib/vin";

/** Error messages are keys of the "validation" namespace in messages/*.json. */
export type FieldErrors = Record<string, string>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const optionalText = z.string().trim().transform((v) => (v === "" ? null : v)).nullable().optional().transform((v) => v ?? null);

const phone = z.string().trim().transform((value, ctx) => {
  if (value === "") return null;
  const parsed = parsePhoneNumberFromString(value, "US");
  if (!parsed || !parsed.isValid()) {
    ctx.addIssue({ code: "custom", message: "invalidPhone" });
    return z.NEVER;
  }
  return parsed.number as string;
});

const email = z.string().trim().toLowerCase().transform((value, ctx) => {
  if (value === "") return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    ctx.addIssue({ code: "custom", message: "invalidEmail" });
    return z.NEVER;
  }
  return value;
});

export const customerSchema = z.object({
  type: z.enum(Constants.public.Enums.customer_type, { message: "required" }),
  first_name: optionalText,
  last_name: optionalText,
  company_name: optionalText,
  phone,
  email,
  source: z.enum(Constants.public.Enums.customer_source, { message: "required" }),
  preferred_language: z.enum(["en", "es"], { message: "required" }),
  address_line1: optionalText,
  address_line2: optionalText,
  city: optionalText,
  state: z.string().trim().toUpperCase().transform((v) => v || "CA"),
  zip: optionalText,
  notes: optionalText,
}).superRefine((c, ctx) => {
  if (c.type === "individual" && !c.first_name && !c.last_name) ctx.addIssue({ code: "custom", path: ["first_name"], message: "nameRequired" });
  if (c.type === "business" && !c.company_name) ctx.addIssue({ code: "custom", path: ["company_name"], message: "companyRequired" });
  if (!c.phone && !c.email) ctx.addIssue({ code: "custom", path: ["phone"], message: "contactRequired" });
});
export type CustomerInput = z.input<typeof customerSchema>;

const optionalInt = (min: number, max: number) => z.string().trim().transform((value, ctx) => {
  if (value === "") return null;
  const n = Number(value.replace(/,/g, ""));
  if (!Number.isInteger(n) || n < min || n > max) {
    ctx.addIssue({ code: "custom", message: "invalidNumber" });
    return z.NEVER;
  }
  return n;
});

export const vehicleSchema = z.object({
  vin: z.string().transform((v) => normalizeVin(v) || null),
  year: optionalInt(1900, 2100),
  make: optionalText,
  model: optionalText,
  trim: optionalText,
  color: optionalText,
  plate: z.string().transform((v) => v.replace(/\s+/g, "").toUpperCase() || null),
  plate_state: z.string().trim().toUpperCase().transform((v) => v || "CA"),
  odometer_mi: optionalInt(0, 2_000_000_000),
  notes: optionalText,
}).superRefine((v, ctx) => {
  if (v.vin) {
    if (!/^[A-Z0-9]+$/.test(v.vin)) ctx.addIssue({ code: "custom", path: ["vin"], message: "vinCharacters" });
    else if (v.year !== null && v.year >= 1981 && v.vin.length !== 17) ctx.addIssue({ code: "custom", path: ["vin"], message: "vinLength17" });
    else if (v.vin.length < 5 || v.vin.length > 17) ctx.addIssue({ code: "custom", path: ["vin"], message: "vinLengthClassic" });
    else if (v.vin.length === 17 && /[IOQ]/.test(v.vin)) ctx.addIssue({ code: "custom", path: ["vin"], message: "vinIOQ" });
  } else {
    if (!v.make) ctx.addIssue({ code: "custom", path: ["make"], message: "makeModelRequired" });
    if (!v.model) ctx.addIssue({ code: "custom", path: ["model"], message: "makeModelRequired" });
  }
});
export type VehicleInput = z.input<typeof vehicleSchema>;

export const APPOINTMENT_DURATIONS: Record<(typeof Constants.public.Enums.appointment_type)[number], number> = {
  estimate: 30, drop_off: 15, delivery: 15, pickup: 15, other: 60,
};

export const appointmentSchema = z.object({
  type: z.enum(Constants.public.Enums.appointment_type, { message: "required" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "required"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "required"),
  duration: z.coerce.number().int().min(5, "invalidNumber").max(24 * 60, "invalidNumber"),
  customer_id: z.uuid().nullable(),
  vehicle_id: z.uuid().nullable(),
  title: optionalText,
  notes: optionalText,
});
export type AppointmentInput = z.input<typeof appointmentSchema>;
