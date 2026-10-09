import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Constants } from "@/lib/database.types";
import { normalizeVin } from "@/lib/vin";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { SHOP_TIMEZONE } from "@/lib/config";
import { parseMoneyToCents } from "@/lib/format";

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
  repair_order_id: z.uuid().nullable().optional(),
  customer_id: z.uuid().nullable(),
  vehicle_id: z.uuid().nullable(),
  title: optionalText,
  notes: optionalText,
});
export type AppointmentInput = z.input<typeof appointmentSchema>;

const orderInteger = (required = false, min = 0) => z.string().trim().transform((value, ctx) => {
  if (value === "" && !required) return null;
  if (value === "") { ctx.addIssue({ code: "custom", message: "required" }); return z.NEVER; }
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > 2_147_483_647) {
    ctx.addIssue({ code: "custom", message: "invalidNumber" }); return z.NEVER;
  }
  return Number(value);
});

const shopDateTime = (required = false) => z.string().trim().transform((value, ctx) => {
  if (!value && !required) return null;
  if (!value) { ctx.addIssue({ code: "custom", message: "required" }); return z.NEVER; }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    ctx.addIssue({ code: "custom", message: "invalidDate" }); return z.NEVER;
  }
  const date = fromZonedTime(value, SHOP_TIMEZONE);
  if (Number.isNaN(date.getTime()) || formatInTimeZone(date, SHOP_TIMEZONE, "yyyy-MM-dd'T'HH:mm") !== value) {
    ctx.addIssue({ code: "custom", message: "invalidDate" }); return z.NEVER;
  }
  return date.toISOString();
});

export const orderSchema = z.object({
  customer_id: z.uuid({ message: "required" }),
  vehicle_id: z.uuid({ message: "required" }),
  type: z.enum(Constants.public.Enums.ro_type, { message: "required" }),
  odometer_in: orderInteger(true).pipe(z.number()),
  odometer_out: orderInteger(),
  requested_repairs: z.string().trim().min(1, "required").max(10000, "tooLong"),
  arrival_circumstance: z.enum(Constants.public.Enums.arrival_circumstance, { message: "required" }),
  received_at: shopDateTime(true).pipe(z.string()),
  promised_at: shopDateTime(),
  notes: optionalText,
}).superRefine((value, ctx) => {
  if (value.odometer_out !== null && value.odometer_out < value.odometer_in) ctx.addIssue({ code: "custom", path: ["odometer_out"], message: "odometerOutLow" });
});
export type OrderInput = z.input<typeof orderSchema>;

const moneyField = (max = Number.MAX_SAFE_INTEGER) => z.string().trim().transform((value, ctx) => {
  if (!value) return null;
  const cents = parseMoneyToCents(value);
  if (cents === null || cents > max) { ctx.addIssue({ code: "custom", message: "invalidMoney" }); return z.NEVER; }
  return cents;
});
const boolChoice = z.enum(["", "true", "false"], { message: "required" }).transform((v) => v === "" ? null : v === "true");

export const estimateDetailsSchema = z.object({
  kind: z.enum(["teardown", "repair", "supplement"]),
  basis: z.enum(Constants.public.Enums.estimate_basis, { message: "required" }),
  teardown_area: optionalText,
  teardown_may_prevent_restoration: boolChoice,
  reassembly_max_days: orderInteger(false, 1),
  pickup_deadline_days: orderInteger(false, 1),
  payor_name: optionalText,
  payor_claim_number: optionalText,
  payor_estimate_total_cents: moneyField(),
  payor_approved_amount_cents: moneyField(),
}).superRefine((value, ctx) => {
  if (!value.payor_name && (value.payor_claim_number || value.payor_approved_amount_cents !== null)) ctx.addIssue({ code: "custom", path: ["payor_name"], message: "required" });
}).transform((value) => {
  const { kind, ...fields } = value;
  if (kind !== "teardown") {
    const { teardown_area: _area, teardown_may_prevent_restoration: _prevent, reassembly_max_days: _days, pickup_deadline_days: _pickup, ...repair } = fields;
    void _area; void _prevent; void _days; void _pickup;
    return { kind, ...repair };
  }
  return { kind, ...fields };
});

export const estimateSendSchema = estimateDetailsSchema.superRefine((value, ctx) => {
  if (value.kind === "teardown") {
    if (!value.teardown_area || /^(?:area\s+of\s+damage|area\s+del\s+dano)[.!]?$/i.test(value.teardown_area.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) ctx.addIssue({ code: "custom", path: ["teardown_area"], message: "teardownArea" });
    if (value.teardown_may_prevent_restoration === null) ctx.addIssue({ code: "custom", path: ["teardown_may_prevent_restoration"], message: "required" });
    if (value.reassembly_max_days === null) ctx.addIssue({ code: "custom", path: ["reassembly_max_days"], message: "required" });
  }
  if (value.basis === "third_party") {
    for (const key of ["payor_name", "payor_claim_number", "payor_estimate_total_cents"] as const) {
      if (value[key] === null) ctx.addIssue({ code: "custom", path: [key], message: "required" });
    }
  }
});

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.enum(values), z.literal("")]).transform((v) => v || null);
export const estimateLineSchema = z.object({
  kind: z.enum(["teardown", "repair", "supplement"]),
  line_type: z.enum(Constants.public.Enums.estimate_line_type, { message: "required" }),
  description: z.string().trim().min(1, "required").max(5000, "tooLong"),
  quantity: z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, "invalidQuantity").transform(Number).refine((n) => n > 0 && n <= 99_999_999.99, "invalidQuantity"),
  unit_price_cents: moneyField(2_147_483_647).pipe(z.number({ message: "required" })),
  taxable: z.boolean(),
  part_condition: optionalEnum(Constants.public.Enums.part_condition),
  is_crash_part: boolChoice,
  crash_part_origin: optionalEnum(Constants.public.Enums.crash_part_origin),
  part_number: optionalText,
  brand: optionalText,
  non_returnable: z.boolean(),
  labor_type: optionalEnum(Constants.public.Enums.labor_type),
  paint_materials_method: optionalEnum(Constants.public.Enums.paint_materials_method),
  sublet_vendor_name: optionalText,
  sublet_vendor_address: optionalText,
  teardown_role: optionalEnum(Constants.public.Enums.teardown_role),
}).superRefine((v, ctx) => {
  if (v.kind !== "teardown" && v.teardown_role) ctx.addIssue({ code: "custom", path: ["teardown_role"], message: "invalidRole" });
  if (v.line_type === "part") {
    if (!v.part_condition) ctx.addIssue({ code: "custom", path: ["part_condition"], message: "required" });
    if (v.is_crash_part === null) ctx.addIssue({ code: "custom", path: ["is_crash_part"], message: "required" });
    if (v.is_crash_part && !v.crash_part_origin) ctx.addIssue({ code: "custom", path: ["crash_part_origin"], message: "crashOriginRequired" });
  }
  if (v.line_type === "labor" && !v.labor_type) ctx.addIssue({ code: "custom", path: ["labor_type"], message: "required" });
  if (v.line_type === "paint_materials" && !v.paint_materials_method) ctx.addIssue({ code: "custom", path: ["paint_materials_method"], message: "required" });
  if (v.line_type === "sublet" && !v.sublet_vendor_name) ctx.addIssue({ code: "custom", path: ["sublet_vendor_name"], message: "required" });
  if (v.kind === "teardown" && v.teardown_role && !((v.line_type === "labor" && ["teardown", "reassembly"].includes(v.teardown_role)) || (["part", "materials"].includes(v.line_type) && v.teardown_role === "destroyed_item"))) ctx.addIssue({ code: "custom", path: ["teardown_role"], message: "invalidRole" });
  if (!Number.isSafeInteger(Math.round(v.quantity * v.unit_price_cents))) ctx.addIssue({ code: "custom", path: ["quantity"], message: "invalidQuantity" });
}).transform(({ kind, teardown_role, ...v }) => ({
  ...v,
  part_condition: v.line_type === "part" ? v.part_condition : null,
  is_crash_part: v.line_type === "part" ? v.is_crash_part : null,
  crash_part_origin: v.line_type === "part" && v.is_crash_part ? v.crash_part_origin : null,
  part_number: v.line_type === "part" ? v.part_number : null,
  brand: v.line_type === "part" ? v.brand : null,
  non_returnable: v.line_type === "part" ? v.non_returnable : null,
  labor_type: v.line_type === "labor" ? v.labor_type : null,
  paint_materials_method: v.line_type === "paint_materials" ? v.paint_materials_method : null,
  sublet_vendor_name: v.line_type === "sublet" ? v.sublet_vendor_name : null,
  sublet_vendor_address: v.line_type === "sublet" ? v.sublet_vendor_address : null,
  teardown_role: kind === "teardown" ? teardown_role : null,
}));

export const orderActivitySchema = z.object({ repair_order_id: z.uuid(), kind: z.enum(["note", "call"], { message: "required" }), body: z.string().trim().min(1, "required").max(5000, "tooLong") });
export const orderStatusSchema = z.object({ id: z.uuid(), status: z.enum(["open", "in_progress", "completed", "delivered", "cancelled"]) });
export const estimateCommandSchema = z.object({ orderId: z.uuid(), estimateId: z.uuid(), command: z.enum(["sent", "draft", "voided"]) });
export const estimateCreateSchema = z.object({ orderId: z.uuid(), kind: z.enum(["teardown", "repair", "supplement"]), parentEstimateId: z.uuid().optional() }).superRefine((v, ctx) => {
  if ((v.kind === "supplement") !== Boolean(v.parentEstimateId)) ctx.addIssue({ code: "custom", path: ["parentEstimateId"], message: "supplementParentInvalid" });
});
export const lineCommandSchema = z.object({ orderId: z.uuid(), estimateId: z.uuid(), lineId: z.uuid(), command: z.enum(["up", "down", "remove"]) });

export const registerDocumentSchema = z.object({
  repair_order_id: z.uuid(), estimate_id: z.uuid().optional(),
  storage_path: z.string().min(1).max(500),
  kind: z.enum(["photo", "third_party_estimate", "authorization_proof", "other"]),
  caption: z.string().trim().max(1000).optional(),
}).superRefine((v, ctx) => {
  if ((v.kind === "third_party_estimate" || v.kind === "authorization_proof") && !v.estimate_id) ctx.addIssue({ code: "custom", path: ["estimate_id"], message: "required" });
});
export const documentEditSchema = z.object({ orderId: z.uuid(), documentId: z.uuid(), caption: z.string().trim().max(1000).optional(), remove: z.boolean().default(false) });
export const attachPayorSchema = z.object({ orderId: z.uuid(), estimateId: z.uuid(), documentId: z.uuid() });
export const freezePdfSchema = z.object({ orderId: z.uuid(), estimateId: z.uuid() });
export const estimateEmailSchema = z.object({
  orderId: z.uuid(), estimateId: z.uuid(),
  email: z.string().trim().max(254, "invalidEmail").pipe(z.email({ message: "invalidEmail" })),
});
export const estimateLinkRevokeSchema = z.object({ orderId: z.uuid(), estimateId: z.uuid(), linkId: z.uuid() });
export const remoteAuthorizationSchema = z.object({
  decision: z.enum(["approved", "declined"]),
  authorizer_name: z.string().trim().min(1, "required").max(200, "tooLong"),
  confirmed: z.boolean(),
  return_parts_requested: z.boolean(),
  signature: z.string().max(700000, "tooLong"),
}).superRefine((v, ctx) => {
  if (v.decision === "approved" && !v.confirmed) ctx.addIssue({ code: "custom", path: ["confirmed"], message: "required" });
  if (v.decision === "approved" && !v.signature) ctx.addIssue({ code: "custom", path: ["signature"], message: "signatureRequired" });
  if (v.decision === "declined" && v.return_parts_requested) ctx.addIssue({ code: "custom", path: ["return_parts_requested"], message: "required" });
});
export const authorizationSchema = z.object({
  orderId: z.uuid(), estimateId: z.uuid(),
  by_designee: z.boolean().default(false),
  decision: z.enum(["approved", "declined"]), method: z.enum(["written", "oral", "electronic"]),
  authorizer_name: z.string().trim().min(1, "required").max(200),
  authorized_at: z.string().transform((v, ctx) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) { ctx.addIssue({ code: "custom", message: "invalidDate" }); return z.NEVER; }
    const date = fromZonedTime(v, SHOP_TIMEZONE);
    if (!Number.isFinite(date.getTime()) || formatInTimeZone(date, SHOP_TIMEZONE, "yyyy-MM-dd'T'HH:mm") !== v) { ctx.addIssue({ code: "custom", message: "invalidDate" }); return z.NEVER; }
    if (date.getTime() > Date.now() || date.getTime() < Date.now() - 7 * 86400000) { ctx.addIssue({ code: "custom", message: "authorizationDateRange" }); return z.NEVER; }
    return date.toISOString();
  }),
  phone_called: phone.prefault(""), contact_email: email.prefault(""), contact_phone: phone.prefault(""),
  signature: z.string().max(700000).optional(),
  return_parts_requested: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (v.method === "written" && (!v.signature || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(v.signature))) ctx.addIssue({ code: "custom", path: ["signature"], message: "signatureRequired" });
  if (v.method === "electronic" && !v.contact_email && !v.contact_phone) ctx.addIssue({ code: "custom", path: ["contact_email"], message: "contactRequired" });
  if (v.decision !== "approved" && v.return_parts_requested) ctx.addIssue({ code: "custom", path: ["return_parts_requested"], message: "rejectedByRules" });
});

export const orderCommandSchema = z.object({ orderId: z.uuid(), command: z.enum(["total_loss", "pickup_notified"]) });
export const teardownOutcomeSchema = z.object({ orderId: z.uuid(), outcome: z.enum(["repair", "reassemble", "declined_reassembly"]) });
export const payorNotificationSchema = z.object({ orderId: z.uuid(), estimateId: z.uuid() });
export const appointmentLinkSchema = z.object({ orderId: z.uuid(), appointmentId: z.uuid(), unlink: z.boolean().default(false) });
export const designeeSchema = z.object({
  orderId: z.uuid(), designee_name: z.string().trim().min(1, "required").max(200),
  designee_phone: phone.prefault(""), designee_email: email.prefault(""),
  designee_signed_at: shopDateTime(true).pipe(z.string()).refine(v => new Date(v).getTime() <= Date.now(), "invalidDate"),
  signature: z.string().max(700000), confirmed: z.literal(true, { message: "required" }),
}).superRefine((v, ctx) => {
  if (!v.designee_phone && !v.designee_email) ctx.addIssue({ code: "custom", path: ["designee_phone"], message: "contactRequired" });
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(v.signature)) ctx.addIssue({ code: "custom", path: ["signature"], message: "signatureRequired" });
});
