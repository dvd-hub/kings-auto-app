// send-estimate-link · Fase 3b3
// Crea un enlace de firma remota (token aleatorio, en la BD solo su hash) y lo envía por
// email con Resend. Lo llama la app (server action) con la sesión del usuario: todo lo que
// lee y escribe pasa por el RLS del taller del usuario. No usa la clave de servicio.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4.6.5";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Kings Auto Collision <estimates@kingsautocollisioninc.com>";
const REPLY_TO = Deno.env.get("NOTIFY_EMAIL") ?? "info@kingsautocollisioninc.com";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
const LINK_DAYS = 7;

function publicKey(): string {
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch { /* se usa la clave antigua */ }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

const bodySchema = z.object({
  estimateId: z.uuid(),
  email: z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function usPhone(value: string | null): string {
  const d = (value ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (value ?? "");
}

function usDateTime(iso: string, locale: "en" | "es", tz: string): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  }).format(new Date(iso));
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const KIND = {
  en: { teardown: "teardown estimate", repair: "repair estimate", supplement: "supplement" },
  es: { teardown: "presupuesto de desmontaje", repair: "presupuesto de reparación", supplement: "suplemento" },
} as const;

type EmailData = {
  locale: "en" | "es"; firstName: string; shopName: string; shopPhone: string; roNumber: number;
  kind: "teardown" | "repair" | "supplement"; seq: number; vehicle: string; total: string; url: string; expires: string;
};

const RED = "#D3000D";
const INK = "#1B1A19";
const MUTED = "#5F5B56";

function emailContent(d: EmailData): { subject: string; html: string; text: string } {
  const es = d.locale === "es";
  const kind = KIND[d.locale][d.kind];
  const kindTitle = kind.charAt(0).toUpperCase() + kind.slice(1);
  const hi = d.firstName ? (es ? `Hola ${d.firstName}:` : `Hi ${d.firstName},`) : (es ? "Hola:" : "Hi,");
  const intro = es
    ? "Tu presupuesto está listo. Revísalo y fírmalo desde tu teléfono en un par de minutos. No empezamos ningún trabajo sin tu autorización."
    : "Your estimate is ready. Review and sign it from your phone in a couple of minutes. We don't start any work without your authorization.";
  const button = es ? "Revisar y firmar" : "Review and sign";
  const expiry = es
    ? `El enlace caduca el ${d.expires}. Es personal: no lo reenvíes.`
    : `This link expires on ${d.expires}. It is personal: please don't forward it.`;
  const questions = es
    ? `¿Preguntas? Llámanos${d.shopPhone ? ` al ${d.shopPhone}` : ""} o responde a este email.`
    : `Questions? Call us${d.shopPhone ? ` at ${d.shopPhone}` : ""} or reply to this email.`;
  const fallback = es ? "¿El botón no funciona? Copia este enlace en tu navegador:" : "Button not working? Copy this link into your browser:";
  const rows: [string, string][] = es
    ? [["Documento", `${kindTitle} n.º ${d.seq}`], ["Orden", `n.º ${d.roNumber}`], ["Vehículo", d.vehicle], ["Total", d.total]]
    : [["Document", `${kindTitle} #${d.seq}`], ["Order", `#${d.roNumber}`], ["Vehicle", d.vehicle], ["Total", d.total]];
  const table = rows.filter(([, v]) => v).map(([k, v], i, all) =>
    `<tr><td style="padding:12px 0;${i < all.length - 1 ? "border-bottom:1px solid #E4E2DE;" : ""}color:${MUTED};font-size:14px;">${esc(k)}</td>` +
    `<td align="right" style="padding:12px 0;${i < all.length - 1 ? "border-bottom:1px solid #E4E2DE;" : ""}color:${INK};font-size:${k === "Total" ? "18px;font-weight:bold" : "15px"};">${esc(v)}</td></tr>`).join("");
  const logo = `${APP_URL}/logo.png`;
  const html = `<!doctype html><html lang="${d.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(button)}</title></head>
<body style="margin:0;padding:0;background:#F4F3F1;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F3F1;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif;">
<tr><td align="center" style="background:#171817;padding:28px 24px;border-radius:12px 12px 0 0;border-bottom:4px solid ${RED};">
<img src="${esc(logo)}" width="260" alt="${esc(d.shopName)}" style="display:block;width:260px;max-width:100%;height:auto;border:0;color:#F4F3F1;font-size:20px;font-weight:bold;">
</td></tr>
<tr><td style="background:#FFFFFF;padding:32px 28px;border:1px solid #E4E2DE;border-top:0;border-radius:0 0 12px 12px;">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${RED};font-weight:bold;">${esc(kindTitle)}</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:${INK};">${es ? "Tu presupuesto está listo" : "Your estimate is ready"}</h1>
<p style="margin:0 0 8px;font-size:16px;line-height:1.5;color:${INK};">${esc(hi)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:${INK};">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">${table}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${RED}" style="border-radius:8px;background:${RED};">
<a href="${esc(d.url)}" target="_blank" style="display:block;padding:18px 24px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${esc(button)} &rarr;</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUTED};text-align:center;">${esc(expiry)}</p>
<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E4E2DE;font-size:15px;line-height:1.5;color:${INK};">${esc(questions)}</p>
<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:${INK};font-weight:bold;">${esc(d.shopName)}</p>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all;">${esc(fallback)}<br><a href="${esc(d.url)}" style="color:${MUTED};">${esc(d.url)}</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = [hi, "", intro, "", ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), "", `${button}: ${d.url}`, "", expiry, "", questions, "", d.shopName].join("\n");
  const subject = es
    ? `Tu presupuesto de ${d.shopName} está listo para firmar`
    : `Your estimate from ${d.shopName} is ready to sign`;
  return { subject, html, text };
}

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  if (!RESEND_API_KEY || !APP_URL) {
    console.error("send-estimate-link: RESEND_API_KEY or APP_URL missing");
    return json(500, { error: "notConfigured" });
  }
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "auth" });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", publicKey(), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) return json(401, { error: "auth" });

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "invalid" }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json(400, { error: "invalid" });
  const { estimateId, email } = parsed.data;

  const { data: est } = await supabase.from("estimates")
    .select("id,shop_id,kind,seq,status,locked_at,repair_order_id")
    .eq("id", estimateId).is("deleted_at", null).maybeSingle();
  if (!est) return json(404, { error: "notFound" });
  if (est.status !== "sent" || est.locked_at) return json(409, { error: "estimateNotSent" });

  const { data: ro } = await supabase.from("repair_orders")
    .select("id,ro_number,customer_id,vehicle_id,customers(first_name,company_name,preferred_language),vehicles(year,make,model)")
    .eq("id", est.repair_order_id).is("deleted_at", null).maybeSingle();
  const { data: shop } = await supabase.from("shops").select("name,phone,timezone").eq("id", est.shop_id).maybeSingle();
  if (!ro || !shop) return json(404, { error: "notFound" });

  // deno-lint-ignore no-explicit-any
  const customer = (ro as any).customers ?? {};
  // deno-lint-ignore no-explicit-any
  const vehicle = (ro as any).vehicles ?? {};
  const locale: "en" | "es" = customer.preferred_language === "es" ? "es" : "en";

  // Un solo enlace vivo por presupuesto: los anteriores sin usar se revocan
  const now = new Date();
  const { error: revokeError } = await supabase.from("estimate_links")
    .update({ revoked_at: now.toISOString() })
    .eq("estimate_id", est.id).is("used_at", null).is("revoked_at", null);
  if (revokeError) { console.error("revoke failed", revokeError.message); return json(500, { error: "linkFailed" }); }

  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(now.getTime() + LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: link, error: linkError } = await supabase.from("estimate_links")
    .insert({ estimate_id: est.id, token_hash: tokenHash, recipient_email: email, expires_at: expiresAt })
    .select("id").single();
  if (linkError || !link) { console.error("link insert failed", linkError?.message); return json(500, { error: "linkFailed" }); }

  const { data: totals } = await supabase.from("estimate_totals").select("total_cents").eq("estimate_id", est.id).maybeSingle();

  const { subject, html, text } = emailContent({
    locale,
    firstName: customer.first_name ?? customer.company_name ?? "",
    shopName: shop.name,
    shopPhone: usPhone(shop.phone),
    roNumber: ro.ro_number,
    kind: est.kind,
    seq: est.seq,
    vehicle: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
    total: typeof totals?.total_cents === "number" ? usd(totals.total_cents) : "",
    url: `${APP_URL}/e/${token}`,
    expires: usDateTime(expiresAt, locale, shop.timezone ?? "America/Los_Angeles"),
  });

  let messageId: string | null = null;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `estimate-link-${link.id}` },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], reply_to: REPLY_TO, subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) messageId = ((await res.json()) as { id?: string }).id ?? null;
    else console.error("resend failed", res.status, (await res.text()).slice(0, 300));
  } catch (error) {
    console.error("resend error", error instanceof Error ? error.message : "unknown");
  }

  if (!messageId) {
    await supabase.from("estimate_links").update({ revoked_at: new Date().toISOString() }).eq("id", link.id);
    return json(502, { error: "emailFailed" });
  }

  await supabase.from("estimate_links").update({ sent_at: new Date().toISOString(), email_message_id: messageId }).eq("id", link.id);
  await supabase.from("activities").insert({
    repair_order_id: ro.id, customer_id: ro.customer_id, vehicle_id: ro.vehicle_id, kind: "email",
    body: JSON.stringify({ module: "orders", key: "estimateEmailedActivity", values: { kind: est.kind, seq: est.seq, email } }),
  });

  return json(200, { ok: true, linkId: link.id, expiresAt });
});
