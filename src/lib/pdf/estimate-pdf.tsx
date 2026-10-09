import "server-only";
/* react-pdf Image does not expose HTML alt attributes. */
/* eslint-disable jsx-a11y/alt-text */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Document, Page, View, Text, Image, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Database } from "@/lib/database.types";
import type { Estimate, EstimateLine, EstimateTotals, RepairOrder } from "@/lib/orders";
import type { Authorization } from "@/lib/document-shared";
import { formatDate, formatDateTime, formatMoney, formatMiles, formatPhone, formatRoNumber } from "@/lib/format";
import { customerName, vehicleLabel } from "@/lib/customers";
import en from "../../../messages/en.json";

type Tables = Database["public"]["Tables"];
export type EstimatePdfData = { shop: Tables["shops"]["Row"]; order: RepairOrder; estimate: Estimate; customer: Tables["customers"]["Row"]; vehicle: Tables["vehicles"]["Row"]; lines: EstimateLine[]; totals: EstimateTotals; authorization: Authorization | null; signature: Buffer | null; supplement: import("@/lib/supplements").SupplementContext | null };

const fonts = path.join(process.cwd(), "src/lib/pdf/fonts");
export const pdfLogo = pathToFileURL(path.join(process.cwd(), "src/lib/pdf/brand/kings-logo-dark.png")).href;
Font.register({ family: "Barlow", fonts: [{ src: path.join(fonts, "Barlow-Regular.ttf") }, { src: path.join(fonts, "Barlow-Bold.ttf"), fontWeight: 700 }] });
Font.register({ family: "IBM Plex Mono", src: path.join(fonts, "IBMPlexMono-Regular.ttf") });
// PDF equivalents of the approved globals.css / AGENTS.md design tokens.
const tokens = { text: "#1B1A19", secondary: "#5F5B56", border: "#E4E2DE", surface: "#FFFFFF", neutral: "#EFEDEA", brand: "#D3000D", sidebar: "#171817" };
export const pdfStyles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 36, paddingBottom: 52, fontFamily: "Barlow", fontSize: 10, lineHeight: 1.35, color: tokens.text, backgroundColor: tokens.surface },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: tokens.brand },
  logo: { width: 170, height: 170 * 273 / 1200, objectFit: "contain" },
  shopDetails: { flex: 1, marginLeft: 24, textAlign: "right" }, shopName: { fontSize: 16, fontWeight: 700, marginBottom: 3 },
  heading: { fontSize: 19, fontWeight: 700, color: tokens.text, marginBottom: 6 }, subheading: { fontSize: 12, fontWeight: 700, marginBottom: 5, borderLeftWidth: 3, borderLeftColor: tokens.brand, paddingLeft: 8 },
  ro: { fontFamily: "IBM Plex Mono", fontSize: 9, color: tokens.brand },
  section: { marginTop: 14 }, mono: { fontFamily: "IBM Plex Mono", fontSize: 9 }, muted: { color: tokens.secondary },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: tokens.border, paddingVertical: 5 },
  tableHeader: { backgroundColor: tokens.neutral, fontWeight: 700 },
  description: { width: "61%", paddingRight: 9 }, quantity: { width: "13%", textAlign: "right" }, amount: { width: "26%", textAlign: "right" },
  subtotal: { textAlign: "right", fontWeight: 700, paddingTop: 5 }, total: { fontSize: 23, lineHeight: 1.3, fontWeight: 700, textAlign: "right", alignSelf: "flex-end", maxWidth: "100%", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: tokens.sidebar, color: tokens.surface, marginTop: 15, marginBottom: 6 },
  watermark: { position: "absolute", top: 340, left: 38, fontSize: 27, color: tokens.brand, opacity: 0.12, transform: "rotate(-28deg)" },
  footer: { position: "absolute", top: 758, left: 36, right: 36, borderTopWidth: 0.5, borderTopColor: tokens.border, paddingTop: 6, fontFamily: "Barlow", fontSize: 8, color: tokens.secondary },
  hash: { fontFamily: "IBM Plex Mono", fontSize: 7, marginTop: 5 }, signature: { width: 240, height: 85, objectFit: "contain", marginVertical: 6 },
});
const s = pdfStyles;
const title = (e: Estimate) => `${e.kind === "teardown" ? "Teardown Estimate" : "Repair Estimate"} ${e.seq}`;
export const pdfAddress = (v: { address_line1: string | null; address_line2?: string | null; city: string | null; state: string | null; zip: string | null }) => [v.address_line1, v.address_line2, [v.city, v.state, v.zip].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
const address = pdfAddress;
const groups: { label: string; types: EstimateLine["line_type"][] }[] = [
  { label: "Parts", types: ["part"] }, { label: "Labor", types: ["labor"] },
  { label: "Paint & materials / Materials", types: ["paint_materials", "materials"] }, { label: "Sublet", types: ["sublet"] }, { label: "Hazardous waste", types: ["hazardous_waste"] },
];
function EstimatePdf({ data, preview, generatedAt }: { data: EstimatePdfData; preview: boolean; generatedAt: string }) {
  const { shop, order, estimate: e, customer, vehicle, lines, totals, authorization: a, signature } = data;
  const documentTitle = data.supplement ? en.phase3b2.supplementTitle.replace("{seq}", String(e.seq)).replace("{kind}", en.estimate_kind[data.supplement.parent.kind]).replace("{parent}", String(data.supplement.parent.seq)) : title(e);
  const roleTotal = (role: EstimateLine["teardown_role"]) => formatMoney(lines.filter((l) => l.teardown_role === role).reduce((n, l) => n + (l.amount_cents ?? 0), 0));
  return <Document title={`${documentTitle} · ${formatRoNumber(order.ro_number)}`} author={shop.legal_name || shop.name} language="en-US">
    <Page size="LETTER" style={s.page}>
      {preview && <Text fixed style={s.watermark}>PREVIEW — NOT AUTHORIZED</Text>}
      <View style={s.header} wrap={false}><Image style={s.logo} src={pdfLogo} /><View style={s.shopDetails}><Text style={s.shopName}>{shop.legal_name || shop.name}</Text><Text>{address(shop)}</Text><Text>{[shop.phone ? formatPhone(shop.phone) : null, shop.email].filter(Boolean).join(" · ")}</Text>{shop.bar_registration_number && <Text>BAR Reg. #{shop.bar_registration_number}</Text>}</View></View>
      <View style={s.section}><Text style={s.heading}>{documentTitle}</Text><Text style={s.ro}>{formatRoNumber(order.ro_number)}</Text><Text>Date sent: {e.sent_at ? formatDate(e.sent_at) : "Not sent"}</Text></View>
      <View style={s.section}><Text style={s.subheading}>Customer and vehicle</Text><Text>{customerName(customer)}</Text><Text>{address(customer)}</Text><Text>{[customer.phone ? formatPhone(customer.phone) : null, customer.email].filter(Boolean).join(" · ")}</Text><Text>{vehicleLabel(vehicle)}</Text><Text style={s.mono}>VIN: {vehicle.vin || "—"}</Text><Text>License plate: {vehicle.plate || "—"} · Odometer in: {formatMiles(order.odometer_in)}</Text></View>
      <View style={s.section}><Text style={s.subheading}>Repairs requested by customer</Text><Text>{order.requested_repairs}</Text></View>
      {e.kind === "teardown" && <View style={s.section}><Text style={s.subheading}>Teardown terms</Text><Text>Area to be disassembled: {e.teardown_area || "—"}</Text><Text>Teardown cost: {roleTotal("teardown")} · Reassembly cost: {roleTotal("reassembly")}</Text><Text>Parts destroyed by teardown: {lines.filter((l) => l.teardown_role === "destroyed_item").map((l) => l.description).join("; ") || "None listed"}</Text><Text>Maximum reassembly time: {e.reassembly_max_days ?? "—"} days from authorization of the teardown.</Text>{e.pickup_deadline_days && <Text>Pickup deadline: {e.pickup_deadline_days} days after notification that reassembly is complete. Storage charges may apply after this deadline.</Text>}{e.teardown_may_prevent_restoration && <Text>Notice: The teardown might prevent the restoration of the vehicle or component(s) to the condition in which it was provided.</Text>}</View>}
      {groups.map((group) => { const rows = lines.filter((l) => group.types.includes(l.line_type)); if (!rows.length) return null; return <View key={group.label} style={s.section}>
        <Text style={s.subheading} minPresenceAhead={40}>{group.label}</Text><View style={[s.row, s.tableHeader]} wrap={false}><Text style={s.description}>Description</Text><Text style={s.quantity}>{group.types[0] === "labor" ? "Hours" : "Quantity"}</Text><Text style={s.amount}>Unit price / Amount</Text></View>
        {rows.map((l) => <View key={l.id}>
          <Text style={{ paddingTop: 5 }}>{l.description}</Text>
          <View style={s.row} wrap={false}><View style={s.description}>{l.line_type === "part" && <Text style={s.muted}>{[l.part_condition ? l.part_condition[0].toUpperCase() + l.part_condition.slice(1) : "", l.is_crash_part ? (l.crash_part_origin === "oem" ? "OEM crash part" : "Non-OEM aftermarket crash part") : "", l.part_number ? `Part #${l.part_number}` : "", l.brand, l.non_returnable ? "Non-returnable" : ""].filter(Boolean).join(" · ")}</Text>}{l.line_type === "hazardous_waste" && <Text>EPA ID: {shop.epa_id_number || "—"}</Text>}</View><Text style={s.quantity}>{l.quantity}</Text><Text style={s.amount}>{formatMoney(l.unit_price_cents)} / {formatMoney(l.amount_cents ?? 0)}</Text></View>
        </View>)}
        <Text style={s.subtotal}>{group.label} subtotal: {formatMoney(rows.reduce((n, l) => n + (l.amount_cents ?? 0), 0))}</Text>
      </View>; })}
      {lines.some((l) => l.line_type === "sublet") && <View style={s.section}><Text style={s.subheading}>Sublet repairs</Text>{lines.filter((l) => l.line_type === "sublet").map((l) => <Text key={l.id}>{l.description} · {l.sublet_vendor_name || ""} · {l.sublet_vendor_address || "Name and location of the sublet facility available on request"}</Text>)}</View>}
      <View wrap={false}><Text style={s.total}>TOTAL {formatMoney(totals.total_cents ?? 0)}</Text><Text style={s.subtotal}>Sales tax, if applicable, will be added on the invoice.</Text></View>
      {data.supplement && <View style={s.section} wrap={false}><Text>{en.phase3b2.authorizedBefore}: {formatMoney(data.supplement.authorizedBefore)}</Text><Text>{en.phase3b2.supplementAmount}: {formatMoney(totals.total_cents ?? 0)}</Text><Text style={s.total}>{en.phase3b2.revisedTotal}: {formatMoney(data.supplement.authorizedBefore + (totals.total_cents ?? 0))}</Text></View>}
      {e.payor_name && <View style={s.section}><Text style={s.subheading}>Third-party payor</Text><Text>{e.payor_name} · Claim #{e.payor_claim_number || "—"}</Text>{e.basis === "third_party" && <><Text>We intend to repair your vehicle per the third-party estimate.</Text><Text>Payor estimate total: {formatMoney(e.payor_estimate_total_cents ?? 0)}</Text><Text>{e.payor_estimate_document_id ? "Third-party estimate attached" : "Third-party estimate not yet attached"}</Text><Text>The third-party estimate is subject to the Fair Claims Settlement Practices Regulations adopted by the California Department of Insurance (California Code of Regulations, Title 10, Chapter 5, Subchapter 7.5, Article 1).</Text></>}{e.payor_approved_amount_cents !== null ? <Text>Approved amount: {formatMoney(e.payor_approved_amount_cents)}</Text> : <Text>{en.estimates.payorLegal}</Text>}</View>}
      <View style={s.section} wrap={false}><Text style={s.subheading}>Customer authorization</Text>{preview || !a ? <><Text>Signature: ________________________________________</Text><Text>Name: _________________________ Date: ______________</Text><Text>[ ] Customer requests return of replaced parts</Text></> : <><Text>Decision: {a.decision === "approved" ? "Approved" : "Declined"} · Method: {a.method === "written" ? "Written (signature)" : a.method === "oral" ? "Oral (phone or in person)" : "Electronic (text or email)"}</Text><Text>Date and time: {formatDateTime(a.authorized_at)} (America/Los_Angeles)</Text><Text>Authorized / declined by: {a.authorizer_name}</Text>{a.by_designee && <Text>{en.phase3b2.authorizedByDesignee}</Text>}{a.phone_called && <Text>Phone called: {formatPhone(a.phone_called)}</Text>}{a.contact_email && <Text>Email: {a.contact_email}</Text>}{a.contact_phone && <Text>Phone: {formatPhone(a.contact_phone)}</Text>}<Text>Return of replaced parts requested: {a.return_parts_requested ? "Yes" : "No"}</Text>{signature && <Image style={s.signature} src={{ data: signature, format: "png" }} />}{a.method === "written" && !signature && <Text>Signature unavailable</Text>}<Text style={s.hash}>Authorization ID: {a.id}</Text><Text style={s.hash}>Content SHA-256:</Text><Text style={s.hash}>{a.content_sha256}</Text></>}<Text style={s.muted}>Exchange or warranty parts cannot be returned; they may be shown to the customer.</Text></View>
      <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${formatRoNumber(order.ro_number)} · Page ${pageNumber} of ${totalPages} · Generated ${formatDateTime(generatedAt)}`} />
    </Page>
  </Document>;
}
export async function renderEstimatePdf(data: EstimatePdfData, preview: boolean) {
  return renderToBuffer(<EstimatePdf data={data} preview={preview} generatedAt={new Date().toISOString()} />);
}
