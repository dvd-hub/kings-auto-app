// send-estimate-receipt · Fase 3b3
// Tras la firma remota, envía al cliente la confirmación con su copia del PDF firmado
// y avisa al taller. La llama la página pública con el token del enlace: solo quien tiene
// el token puede pedirla, y solo sale una vez por enlace (receipt_sent_at).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4.6.5";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Kings Auto Collision <estimates@kingsautocollisioninc.com>";
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "info@kingsautocollisioninc.com";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");

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

const bodySchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

const RED = "#D3000D";
const INK = "#1B1A19";
const MUTED = "#5F5B56";

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

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function usDateTime(iso: string, locale: "en" | "es", tz: string): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
  }).format(new Date(iso));
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const KIND = {
  en: { teardown: "teardown estimate", repair: "repair estimate", supplement: "supplement" },
  es: { teardown: "presupuesto de desmontaje", repair: "presupuesto de reparación", supplement: "suplemento" },
} as const;

function layout(locale: string, title: string, inner: string): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F4F3F1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F3F1;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif;">
<tr><td align="center" style="background:#171817;padding:28px 24px;border-radius:12px 12px 0 0;border-bottom:4px solid ${RED};">
<img src="${esc(APP_URL)}/logo.png" width="260" alt="Kings Auto Collision" style="display:block;width:260px;max-width:100%;height:auto;border:0;color:#F4F3F1;font-size:20px;font-weight:bold;">
</td></tr>
<tr><td style="background:#FFFFFF;padding:32px 28px;border:1px solid #E4E2DE;border-top:0;border-radius:0 0 12px 12px;">
${inner}
</td></tr></table></td></tr></table></body></html>`;
}

function rowsHtml(rows: [string, string][], strongLast = true): string {
  const list = rows.filter(([, v]) => v);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">` + list.map(([k, v], i) => {
    const line = i < list.length - 1 ? "border-bottom:1px solid #E4E2DE;" : "";
    const big = strongLast && i === list.length - 1 ? "font-size:18px;font-weight:bold;" : "font-size:15px;";
    return `<tr><td style="padding:12px 0;${line}color:${MUTED};font-size:14px;">${esc(k)}</td><td align="right" style="padding:12px 0;${line}color:${INK};${big}">${esc(v)}</td></tr>`;
  }).join("") + `</table>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  if (!RESEND_API_KEY || !APP_URL) return json(500, { error: "notConfigured" });

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "invalid" }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json(400, { error: "invalid" });
  const tokenHash = await sha256Hex(parsed.data.token);

  const { data: link } = await supabase.from("estimate_links")
    .select("id,shop_id,estimate_id,recipient_email,authorization_id,receipt_sent_at")
    .eq("token_hash", tokenHash).is("deleted_at", null).maybeSingle();
  if (!link || !link.authorization_id) return json(404, { error: "notFound" });
  if (link.receipt_sent_at) return json(200, { ok: true, already: true });

  const [{ data: auth }, { data: est }, { data: shop }] = await Promise.all([
    supabase.from("authorizations").select("decision,authorizer_name,authorized_at,amount_cents,return_parts_requested").eq("id", link.authorization_id).maybeSingle(),
    supabase.from("estimates").select("id,kind,seq,repair_order_id,pdf_document_id").eq("id", link.estimate_id).maybeSingle(),
    supabase.from("shops").select("name,phone,timezone").eq("id", link.shop_id).maybeSingle(),
  ]);
  if (!auth || !est || !shop) return json(404, { error: "notFound" });
  const { data: ro } = await supabase.from("repair_orders")
    .select("id,ro_number,customers(first_name,last_name,company_name,preferred_language),vehicles(year,make,model)")
    .eq("id", est.repair_order_id).maybeSingle();
  if (!ro) return json(404, { error: "notFound" });

  // deno-lint-ignore no-explicit-any
  const customer = (ro as any).customers ?? {};
  // deno-lint-ignore no-explicit-any
  const vehicle = (ro as any).vehicles ?? {};
  const locale: "en" | "es" = customer.preferred_language === "es" ? "es" : "en";
  const es = locale === "es";
  const approved = auth.decision === "approved";
  const tz = shop.timezone ?? "America/Los_Angeles";
  const vehicleText = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const kindTitle = (() => { const k = KIND[locale][est.kind as "teardown" | "repair" | "supplement"]; return k.charAt(0).toUpperCase() + k.slice(1); })();
  const phone = usPhone(shop.phone);

  // PDF firmado (si ya está congelado). Si no, el email va sin adjunto y con el enlace.
  let attachment: { filename: string; content: string } | null = null;
  if (est.pdf_document_id) {
    const { data: doc } = await supabase.from("documents").select("storage_path,sha256").eq("id", est.pdf_document_id).maybeSingle();
    if (doc) {
      const { data: file } = await supabase.storage.from("documents").download(doc.storage_path);
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
        if (digest === doc.sha256) attachment = { filename: `estimate-RO${ro.ro_number}-${est.kind}-${est.seq}.pdf`, content: toBase64(bytes) };
      }
    }
  }

  // Email al cliente
  const title = approved
    ? (es ? "Gracias, recibimos tu autorización" : "Thank you, we received your authorization")
    : (es ? "Recibimos tu respuesta" : "We received your response");
  const hi = customer.first_name ? (es ? `Hola ${customer.first_name}:` : `Hi ${customer.first_name},`) : (es ? "Hola:" : "Hi,");
  const body = approved
    ? (es ? "Autorizaste el trabajo de este presupuesto. Te avisaremos cuando avancemos con tu vehículo." : "You authorized the work on this estimate. We'll keep you posted as we work on your vehicle.")
    : (es ? "Rechazaste este presupuesto. No haremos ese trabajo. Si quieres hablarlo, llámanos." : "You declined this estimate. We won't do that work. If you'd like to talk it over, give us a call.");
  const copy = attachment
    ? (es ? "Adjuntamos tu copia firmada en PDF. Guárdala para tus registros." : "Your signed copy is attached as a PDF. Please keep it for your records.")
    : (es ? "Puedes descargar tu copia firmada desde el enlace del email anterior." : "You can download your signed copy from the link in our previous email.");
  const rows: [string, string][] = [
    [es ? "Documento" : "Document", `${kindTitle} ${es ? "n.º " : "#"}${est.seq}`],
    [es ? "Orden" : "Order", `${es ? "n.º " : "#"}${ro.ro_number}`],
    [es ? "Vehículo" : "Vehicle", vehicleText],
    [es ? "Decisión" : "Decision", approved ? (es ? "Aprobado" : "Approved") : (es ? "Rechazado" : "Declined")],
    [es ? "Firmado por" : "Signed by", auth.authorizer_name],
    [es ? "Fecha" : "Date", usDateTime(auth.authorized_at, locale, tz)],
    [es ? "Importe autorizado" : "Authorized amount", approved ? usd(Number(auth.amount_cents)) : ""],
  ];
  const questions = es
    ? `¿Preguntas? Llámanos${phone ? ` al ${phone}` : ""} o responde a este email.`
    : `Questions? Call us${phone ? ` at ${phone}` : ""} or reply to this email.`;
  const customerHtml = layout(locale, title, `
<p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${approved ? RED : MUTED};font-weight:bold;">${esc(approved ? (es ? "Autorizado" : "Authorized") : (es ? "Rechazado" : "Declined"))}</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:${INK};">${esc(title)}</h1>
<p style="margin:0 0 8px;font-size:16px;line-height:1.5;color:${INK};">${esc(hi)}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:${INK};">${esc(body)}</p>
${rowsHtml(rows, approved)}
<p style="margin:0 0 0;font-size:15px;line-height:1.5;color:${INK};">${esc(copy)}</p>
<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E4E2DE;font-size:15px;line-height:1.5;color:${INK};">${esc(questions)}</p>
<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:${INK};font-weight:bold;">${esc(shop.name)}</p>`);
  const customerText = [hi, "", body, "", ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), "", copy, "", questions, "", shop.name].join("\n");

  const send = async (payload: Record<string, unknown>, key: string) => {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) console.error("resend failed", res.status, (await res.text()).slice(0, 300));
      return res.ok;
    } catch (error) {
      console.error("resend error", error instanceof Error ? error.message : "unknown");
      return false;
    }
  };

  const customerOk = await send({
    from: FROM_EMAIL, to: [link.recipient_email], reply_to: NOTIFY_EMAIL,
    subject: approved
      ? (es ? `Tu autorización: orden n.º ${ro.ro_number} — ${shop.name}` : `Your authorization: order #${ro.ro_number} — ${shop.name}`)
      : (es ? `Tu respuesta: orden n.º ${ro.ro_number} — ${shop.name}` : `Your response: order #${ro.ro_number} — ${shop.name}`),
    html: customerHtml, text: customerText,
    ...(attachment ? { attachments: [attachment] } : {}),
  }, `estimate-receipt-${link.id}`);
  if (!customerOk) return json(502, { error: "emailFailed" });

  await supabase.rpc("mark_estimate_receipt_sent", { p_token_hash: tokenHash });

  // Aviso al taller (siempre en inglés, como la app por defecto)
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company_name || auth.authorizer_name;
  const shopRows: [string, string][] = [
    ["Customer", name], ["Signed by", auth.authorizer_name], ["Order", `#${ro.ro_number}`], ["Vehicle", vehicleText],
    ["Document", `${KIND.en[est.kind as "teardown" | "repair" | "supplement"]} #${est.seq}`],
    ["Return replaced parts", approved ? (auth.return_parts_requested ? "Yes" : "No") : ""],
    ["Signed PDF", attachment ? "Attached" : "Pending: open the estimate in the app and generate it"],
    [approved ? "Authorized amount" : "Decision", approved ? usd(Number(auth.amount_cents)) : "Declined"],
  ];
  const shopTitle = approved ? `Estimate approved by ${name}` : `Estimate declined by ${name}`;
  await send({
    from: FROM_EMAIL, to: [NOTIFY_EMAIL],
    subject: `${approved ? "[APPROVED]" : "[DECLINED]"} Order #${ro.ro_number}: ${name}${vehicleText ? ` · ${vehicleText}` : ""}`,
    html: layout("en", shopTitle, `<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:${INK};">${esc(shopTitle)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:${INK};">The customer signed electronically from the link we emailed. The estimate is now locked in the app.</p>
${rowsHtml(shopRows)}`),
    text: [shopTitle, "", ...shopRows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)].join("\n"),
    ...(attachment ? { attachments: [attachment] } : {}),
  }, `estimate-receipt-shop-${link.id}`);

  return json(200, { ok: true });
});
