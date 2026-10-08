// Edge Function web-intake: recibe las solicitudes de /estimate de la web pública.
// Solo la llama el servidor de la web (nunca el navegador), con el secreto compartido en la cabecera x-intake-secret.
// Acciones:
//   submit -> valida, verifica Turnstile, crea cliente/vehículo/cita/solicitud (RPC web_intake_submit)
//             y devuelve enlaces firmados para subir hasta 5 fotos.
//   attach -> registra las fotos ya subidas (RPC web_intake_attach_photos; comprueba que existen en Storage).
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4.6.5";
import { sendIntakeEmails } from "./emails.ts";

const SHOP_ID = Deno.env.get("KINGS_SHOP_ID") ?? "58788290-35ad-4dbb-8cd7-e5576ccdc548";
const INTAKE_SECRET = Deno.env.get("WEB_INTAKE_SECRET") ?? "";
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // las fotos llegan comprimidas desde el navegador
const PHOTO_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" } as const;

function serviceKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch { /* se usa la clave antigua */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Teléfono de EE. UU. a E.164
const phone = z.string().trim().transform((value, ctx) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  ctx.addIssue({ code: "custom", message: "phone" });
  return z.NEVER;
});
const text = (max: number) => z.string().trim().max(max).optional().default("");

const submitSchema = z.object({
  action: z.literal("submit"),
  turnstile_token: z.string().min(1).max(2048),
  honeypot: z.string().max(500).optional().default(""),
  first_name: z.string().trim().min(1).max(80),
  last_name: text(80),
  phone,
  email: z.union([z.literal(""), z.email().max(254)]).optional().default(""),
  locale: z.enum(["en", "es"]),
  service: text(60),
  damage_description: z.string().trim().min(5).max(2000),
  is_insurance_claim: z.boolean().optional(),
  insurer_name: text(120),
  claim_number: text(60),
  year: z.number().int().min(1900).max(2100).optional(),
  make: text(40),
  model: text(60),
  vin: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[A-Z0-9]{5,17}$/)]).optional().default(""),
  preferred_date: z.iso.date(),
  preferred_window: z.enum(["morning", "afternoon"]),
  privacy_accepted: z.literal(true),
  marketing_opt_in: z.boolean().optional().default(false),
  consent_text: z.string().min(1).max(4000),
  consent_version: z.string().min(1).max(40),
  meta_event_id: z.uuid(),
  utm_source: text(200),
  utm_medium: text(200),
  utm_campaign: text(200),
  utm_term: text(200),
  utm_content: text(200),
  fbclid: text(500),
  fbc: text(500),
  fbp: text(200),
  landing_page: text(2000),
  referrer: text(2000),
  ip: z.union([z.ipv4(), z.ipv6()]).optional(),
  user_agent: text(500),
  photos: z.array(z.object({
    type: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
    size: z.number().int().positive().max(MAX_PHOTO_BYTES),
  })).max(MAX_PHOTOS).optional().default([]),
});

const attachSchema = z.object({
  action: z.literal("attach"),
  web_request_id: z.uuid(),
  paths: z.array(z.string().max(300)).min(1).max(MAX_PHOTOS),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Comparación del secreto en tiempo constante
async function sameSecret(given: string): Promise<boolean> {
  if (!INTAKE_SECRET || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(INTAKE_SECRET)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function turnstileOk(token: string, ip: string | undefined, key: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return false;
  const form = new FormData();
  form.append("secret", TURNSTILE_SECRET);
  form.append("response", token);
  form.append("idempotency_key", key); // permite reintentar con el mismo token
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = await res.json() as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

async function submit(input: z.infer<typeof submitSchema>): Promise<Response> {
  // Campo trampa relleno: se responde como si todo fuera bien, pero no se guarda nada
  if (input.honeypot) return json(200, { ok: true, spam: true });

  if (!(await turnstileOk(input.turnstile_token, input.ip, input.meta_event_id))) {
    return json(400, { ok: false, error: "turnstile" });
  }

  const { turnstile_token: _t, honeypot: _h, photos, action: _a, ...fields } = input;
  const payload = { ...fields, shop_id: SHOP_ID, year: fields.year?.toString() ?? "" };

  const { data, error } = await supabase.rpc("web_intake_submit", { p: payload });
  if (error) {
    if (error.message.includes("invalid_date")) return json(400, { ok: false, error: "invalid_date" });
    console.error("web_intake_submit failed", error.code, error.message);
    return json(500, { ok: false, error: "server" });
  }
  const result = data as { web_request_id: string; duplicate: boolean };

  const uploads: { path: string; signed_url: string; token: string; type: string }[] = [];
  for (const photo of photos) {
    const path = `${SHOP_ID}/web/${result.web_request_id}/${crypto.randomUUID()}.${PHOTO_EXT[photo.type]}`;
    const { data: signed, error: signError } = await supabase.storage.from("documents").createSignedUploadUrl(path);
    if (signError || !signed) {
      console.error("createSignedUploadUrl failed", signError?.message);
      continue; // la solicitud ya está guardada; se pierde solo esa foto
    }
    uploads.push({ path: signed.path, signed_url: signed.signedUrl, token: signed.token, type: photo.type });
  }

  // Emails (Resend): solo la primera vez; en segundo plano para no retrasar la respuesta
  if (!result.duplicate) {
    const emails = sendIntakeEmails({
      web_request_id: result.web_request_id, meta_event_id: input.meta_event_id, locale: input.locale,
      first_name: input.first_name, last_name: input.last_name, phone: input.phone, email: input.email,
      service: input.service, damage_description: input.damage_description,
      is_insurance_claim: input.is_insurance_claim, insurer_name: input.insurer_name, claim_number: input.claim_number,
      year: input.year, make: input.make, model: input.model, vin: input.vin,
      preferred_date: input.preferred_date, preferred_window: input.preferred_window,
      photo_count: photos.length, utm_source: input.utm_source, utm_campaign: input.utm_campaign,
    });
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
    if (runtime) runtime.waitUntil(emails);
    else await emails;
  }

  return json(200, { ok: true, web_request_id: result.web_request_id, duplicate: result.duplicate, uploads });
}

async function attach(input: z.infer<typeof attachSchema>): Promise<Response> {
  const { data, error } = await supabase.rpc("web_intake_attach_photos", {
    p_shop: SHOP_ID, p_request: input.web_request_id, p_paths: input.paths,
  });
  if (error) {
    if (error.message.includes("invalid_path") || error.message.includes("unknown_request")) {
      return json(400, { ok: false, error: "invalid" });
    }
    console.error("web_intake_attach_photos failed", error.code, error.message);
    return json(500, { ok: false, error: "server" });
  }
  return json(200, { ok: true, attached: data as number });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method" });
  if (!(await sameSecret(req.headers.get("x-intake-secret") ?? ""))) return json(401, { ok: false, error: "unauthorized" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid" });
  }

  const action = (body as { action?: unknown })?.action;
  if (action === "submit") {
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) return json(400, { ok: false, error: "invalid", fields: parsed.error.issues.map((i) => i.path.join(".")) });
    return submit(parsed.data);
  }
  if (action === "attach") {
    const parsed = attachSchema.safeParse(body);
    if (!parsed.success) return json(400, { ok: false, error: "invalid" });
    return attach(parsed.data);
  }
  return json(400, { ok: false, error: "invalid" });
});
