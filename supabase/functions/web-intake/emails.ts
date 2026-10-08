// Emails de web-intake con Resend: aviso al taller y confirmación al cliente.
// Nunca hacen fallar la solicitud: si Resend falla, solo se registra en los logs.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL") ?? "info@kingsautocollisioninc.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Kings Auto Collision <estimates@kingsautocollisioninc.com>";
const BRAND = "Kings Auto Collision";

export type IntakeEmailData = {
  web_request_id: string;
  meta_event_id: string;
  locale: "en" | "es";
  first_name: string;
  last_name: string;
  phone: string; // E.164 (+1XXXXXXXXXX)
  email: string;
  service: string;
  damage_description: string;
  is_insurance_claim?: boolean;
  insurer_name: string;
  claim_number: string;
  year?: number;
  make: string;
  model: string;
  vin: string;
  preferred_date: string; // YYYY-MM-DD
  preferred_window: "morning" | "afternoon";
  needs_tow: boolean;
  photo_count: number;
  utm_source: string;
  utm_campaign: string;
};

// Franjas (a confirmar con el taller; deben coincidir con business.estimateWindows de la web)
const WINDOWS = {
  en: { morning: "Morning (8:00 AM–12:00 PM)", afternoon: "Afternoon (1:00 PM–5:00 PM)" },
  es: { morning: "Mañana (8:00 AM–12:00 PM)", afternoon: "Tarde (1:00 PM–5:00 PM)" },
} as const;

const SERVICES: Record<string, { en: string; es: string }> = {
  "collision-repair": { en: "Collision repair", es: "Reparación de colisiones" },
  "auto-painting": { en: "Auto painting", es: "Pintura automotriz" },
  "paintless-dent-repair": { en: "Paintless dent repair", es: "Reparación de abolladuras sin pintura" },
  "frame-repair": { en: "Frame repair", es: "Reparación de chasis" },
  "classic-car-restoration": { en: "Classic car restoration", es: "Restauración de autos clásicos" },
  other: { en: "Not sure / other", es: "No estoy seguro / otro" },
};

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// +19255550142 → (925) 555-0142
function usPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

// 2026-10-09 → Fri, Oct 9, 2026 (formato de EE. UU. en los dos idiomas)
function usDate(iso: string, locale: "en" | "es"): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function vehicle(d: IntakeEmailData): string {
  return [d.year?.toString() ?? "", d.make, d.model].filter(Boolean).join(" ");
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F4F3F1;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:#1B1A19;">
<div style="background:#171817;color:#F4F3F1;padding:20px 24px;font-size:18px;font-weight:bold;letter-spacing:.5px;">${esc(BRAND)}</div>
<div style="background:#ffffff;border:1px solid #E4E2DE;border-top:0;padding:24px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${esc(title)}</h1>
${body}
</div></div></body></html>`;
}

function rows(items: [string, string][]): string {
  const tr = items.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:8px 12px 8px 0;color:#5F5B56;vertical-align:top;white-space:nowrap;">${esc(k)}</td>` +
    `<td style="padding:8px 0;vertical-align:top;">${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("");
  return `<table style="border-collapse:collapse;width:100%;font-size:15px;line-height:1.5;">${tr}</table>`;
}

function shopEmail(d: IntakeEmailData) {
  const name = `${d.first_name} ${d.last_name}`.trim();
  const insurance = d.is_insurance_claim === true
    ? ["Yes", d.insurer_name, d.claim_number ? `Claim # ${d.claim_number}` : ""].filter(Boolean).join(" · ")
    : d.is_insurance_claim === false ? "No" : "Not sure";
  const items: [string, string][] = [
    ["Tow", d.needs_tow ? "YES: the car cannot be driven. Arrange pickup." : ""],
    ["Name", name],
    ["Phone", usPhone(d.phone)],
    ["Email", d.email],
    ["Vehicle", vehicle(d)],
    ["VIN", d.vin],
    ["Service", SERVICES[d.service]?.en ?? d.service],
    ["Damage", d.damage_description],
    ["Insurance", insurance],
    ["Preferred day", usDate(d.preferred_date, "en")],
    ["Preferred time", WINDOWS.en[d.preferred_window]],
    ["Photos", d.photo_count ? `${d.photo_count} (see the request in the app)` : "None"],
    ["Language", d.locale === "es" ? "Spanish" : "English"],
    ["Source", [d.utm_source, d.utm_campaign].filter(Boolean).join(" / ") || "Website"],
  ];
  const html = layout("New estimate request", `
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">A new request arrived from the website. It is in the app calendar as <strong>Requested</strong>. Call the customer to confirm the exact time, then confirm the appointment.</p>
${rows(items)}
<p style="margin:16px 0 0;font-size:13px;color:#5F5B56;">Request ID: ${esc(d.web_request_id)}</p>`);
  return {
    from: FROM_EMAIL,
    to: [NOTIFY_EMAIL],
    reply_to: d.email || undefined,
    subject: `${d.needs_tow ? "[TOW] " : ""}New estimate request: ${name}${vehicle(d) ? ` · ${vehicle(d)}` : ""}`,
    html,
  };
}

function customerEmail(d: IntakeEmailData) {
  const es = d.locale === "es";
  const when = `${usDate(d.preferred_date, d.locale)} · ${WINDOWS[d.locale][d.preferred_window]}`;
  const items: [string, string][] = es
    ? [["Vehículo", vehicle(d)], ["Servicio", SERVICES[d.service]?.es ?? d.service], ["Día y franja preferidos", when]]
    : [["Vehicle", vehicle(d)], ["Service", SERVICES[d.service]?.en ?? d.service], ["Preferred day and time", when]];
  const intro = es
    ? (d.needs_tow
      ? `Hola ${esc(d.first_name)}, recibimos tu solicitud de presupuesto. Te llamaremos para organizar la recogida de tu auto con grúa.`
      : `Hola ${esc(d.first_name)}, recibimos tu solicitud de presupuesto. Te llamaremos para confirmar la hora exacta de tu visita.`)
    : (d.needs_tow
      ? `Hi ${esc(d.first_name)}, we received your estimate request. We'll call you to arrange the tow pickup for your car.`
      : `Hi ${esc(d.first_name)}, we received your estimate request. We'll call you to confirm the exact time of your visit.`);
  const outro = es
    ? "Si quieres añadir algo, responde a este email."
    : "If you'd like to add anything, just reply to this email.";
  const html = layout(es ? "Recibimos tu solicitud" : "We received your request", `
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${intro}</p>
${rows(items)}
<p style="margin:16px 0 0;font-size:15px;line-height:1.5;">${outro}</p>
<p style="margin:16px 0 0;font-size:15px;line-height:1.5;">— ${esc(BRAND)}</p>`);
  return {
    from: FROM_EMAIL,
    to: [d.email],
    reply_to: NOTIFY_EMAIL,
    subject: es ? `Recibimos tu solicitud de presupuesto — ${BRAND}` : `We received your estimate request — ${BRAND}`,
    html,
  };
}

async function send(payload: Record<string, unknown>, idempotencyKey: string): Promise<void> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("resend failed", res.status, (await res.text()).slice(0, 300));
  } catch (error) {
    console.error("resend error", error instanceof Error ? error.message : "unknown");
  }
}

export async function sendIntakeEmails(d: IntakeEmailData): Promise<void> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY missing: emails not sent");
    return;
  }
  const jobs = [send(shopEmail(d), `shop-${d.meta_event_id}`)];
  if (d.email) jobs.push(send(customerEmail(d), `customer-${d.meta_event_id}`));
  await Promise.all(jobs);
}
