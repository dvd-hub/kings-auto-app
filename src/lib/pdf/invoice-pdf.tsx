import "server-only";
/* react-pdf Image does not expose HTML alt attributes. */
/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Database } from "@/lib/database.types";
import type { Invoice, InvoiceLine } from "@/lib/invoices";
import type { Estimate, RepairOrder } from "@/lib/orders";
import type { Authorization } from "@/lib/document-shared";
import { formatDateTime, formatInvoiceNumber, formatMiles, formatMoney, formatPhone, formatRoNumber } from "@/lib/format";
import { formatTaxRate } from "@/lib/invoices";
import { customerName, vehicleLabel } from "@/lib/customers";
import { pdfAddress, pdfLogo, pdfStyles as s } from "./estimate-pdf";

type Tables = Database["public"]["Tables"];
export type InvoicePdfData = {
  shop: Tables["shops"]["Row"];
  order: RepairOrder;
  invoice: Invoice;
  customer: Tables["customers"]["Row"];
  vehicle: Tables["vehicles"]["Row"];
  lines: InvoiceLine[];
  authorizations: { estimate: Estimate; authorization: Authorization }[];
};

const money = (value: number | null) => value === null ? "Not issued" : formatMoney(value);
const estimateTitle = (estimate: Estimate) => `${estimate.kind === "teardown" ? "Teardown" : estimate.kind === "supplement" ? "Supplement" : "Repair"} estimate ${estimate.seq}`;

const invoiceStyles = StyleSheet.create({
  watermarkPage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: 612, height: 792, justifyContent: "center", alignItems: "center" },
  watermark: { fontFamily: "Barlow", fontSize: 120, fontWeight: 700, lineHeight: 1, color: s.ro.color, opacity: 0.12, transform: "rotate(-35deg)" },
});

function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const { shop, order, invoice, customer, vehicle, authorizations } = data;
  const lines = data.lines.filter(line => !line.deleted_at);
  const number = invoice.invoice_number === null ? "DRAFT" : formatInvoiceNumber(invoice.invoice_number);
  const groups = [
    ["Labor", invoice.labor_cents], ["Parts", invoice.parts_cents], ["Materials", invoice.materials_cents],
    ["Sublet", invoice.sublet_cents], ["Hazardous waste", invoice.hazardous_waste_cents],
  ] as const;
  return <Document title={`Invoice ${number} · ${formatRoNumber(order.ro_number)}`} author={shop.legal_name || shop.name} language="en-US">
    <Page size="LETTER" style={s.page}>
      {invoice.status !== "issued" && <View fixed wrap={false} style={invoiceStyles.watermarkPage}><Text style={invoiceStyles.watermark}>{invoice.status === "voided" ? "VOID" : "DRAFT"}</Text></View>}
      <View style={s.header} wrap={false}><Image style={s.logo} src={pdfLogo} /><View style={s.shopDetails}>
        <Text style={s.shopName}>{shop.legal_name || shop.name}</Text><Text>{pdfAddress(shop)}</Text>
        {shop.phone && <Text>{formatPhone(shop.phone)}</Text>}
        <Text>BAR Registration No. {shop.bar_registration_number || "—"}</Text>
        {lines.some(line => line.line_type === "hazardous_waste") && <Text>EPA ID No. {shop.epa_id_number || "—"}</Text>}
      </View></View>
      <View style={s.section}><Text style={s.heading}>INVOICE</Text><Text style={s.ro}>{number} · {formatRoNumber(order.ro_number)}</Text>
        <Text>Issued: {invoice.issued_at ? `${formatDateTime(invoice.issued_at)} (America/Los_Angeles)` : "Not issued"}</Text>
        {invoice.status === "voided" && <Text>Void reason: {invoice.void_reason}</Text>}
      </View>
      <View style={s.section}><Text style={s.subheading}>Customer and vehicle</Text><Text>{customerName(customer)}</Text>
        <Text>{[customer.phone ? formatPhone(customer.phone) : null, customer.email].filter(Boolean).join(" · ")}</Text>
        <Text>{vehicleLabel(vehicle)}</Text><Text style={s.mono}>VIN: {vehicle.vin || "—"}</Text>
        <Text>License plate: {vehicle.plate || "—"}</Text><Text>Odometer in: {formatMiles(order.odometer_in)} · Odometer out: {invoice.odometer_out === null ? "Not issued" : formatMiles(invoice.odometer_out)}</Text>
      </View>
      {authorizations.filter(({ estimate }) => estimate.payor_name).map(({ estimate }) => <View key={estimate.id} style={s.section} wrap={false}>
        <Text style={s.subheading}>Third-party payor</Text><Text>{estimateTitle(estimate)} · {estimate.payor_name} · Claim #{estimate.payor_claim_number || "—"}</Text>
      </View>)}
      <View style={s.section}><Text style={s.subheading} minPresenceAhead={40}>Invoice lines</Text>
        <View style={[s.row, s.tableHeader]} wrap={false}><Text style={s.description}>Description</Text><Text style={s.quantity}>Quantity</Text><Text style={s.amount}>Unit price / Amount</Text></View>
        {lines.map(line => <View key={line.id}>
          <Text style={{ paddingTop: 5 }}>{line.description}</Text>
          <View style={s.row} wrap={false}><View style={s.description}>
            {line.line_type === "part" && <Text style={s.muted}>{[
              line.part_condition ? line.part_condition[0].toUpperCase() + line.part_condition.slice(1) : "",
              line.is_crash_part ? (line.crash_part_origin === "oem" ? "OEM crash part" : "Non-OEM aftermarket crash part") : "",
              line.part_number ? `Part #${line.part_number}` : "", line.brand, line.non_returnable ? "Non-returnable" : "",
            ].filter(Boolean).join(" · ")}</Text>}
            {line.line_type === "sublet" && <Text style={s.muted}>Sublet: {line.sublet_vendor_name || "Name of the sublet facility available on request"}</Text>}
          </View><Text style={s.quantity}>{line.quantity}</Text><Text style={s.amount}>{formatMoney(line.unit_price_cents)} / {line.amount_cents === null ? "—" : formatMoney(line.amount_cents)}</Text></View>
        </View>)}
      </View>
      <View style={s.section} wrap={false}>
        {groups.map(([label, value]) => value !== null && value > 0 ? <Text key={label} style={s.subtotal}>{label} subtotal: {formatMoney(value)}</Text> : null)}
        <Text style={s.subtotal}>Taxable base: {money(invoice.taxable_cents)}</Text>
        <Text style={s.subtotal}>Sales tax ({invoice.tax_rate === null ? "—" : formatTaxRate(invoice.tax_rate)}): {money(invoice.tax_cents)}</Text>
        <Text style={s.total}>TOTAL {money(invoice.total_cents)}</Text>
        <Text style={s.subtotal}>Authorized amount: {money(invoice.authorized_cents)}</Text>
      </View>
      <View style={s.section}><Text style={s.subheading} minPresenceAhead={60}>Authorizations</Text>
        {authorizations.map(({ estimate, authorization: auth }) => <View key={estimate.id} style={{ marginBottom: 10 }} wrap={false}>
          <Text style={{ fontWeight: 700 }}>{estimateTitle(estimate)}</Text>
          <Text>Method: {auth.method === "written" ? "Written (signature)" : auth.method === "oral" ? "Oral (phone or in person)" : "Electronic (text or email)"}</Text>
          <Text>Date and time: {formatDateTime(auth.authorized_at)} (America/Los_Angeles)</Text><Text>Authorized by: {auth.authorizer_name}</Text>
          {auth.by_designee && <Text>Authorized by the customer&apos;s designated person.</Text>}
          {auth.method === "oral" && <Text>Phone called: {auth.phone_called ? formatPhone(auth.phone_called) : "In person"}</Text>}
          {auth.method === "electronic" && <>{auth.contact_email && <Text>Email used: {auth.contact_email}</Text>}{auth.contact_phone && <Text>Phone used: {formatPhone(auth.contact_phone)}</Text>}</>}
        </View>)}
      </View>
      {order.teardown_outcome && order.teardown_outcome !== "repair" && <View style={s.section} wrap={false}><Text style={s.subheading}>Teardown outcome</Text>
        <Text>{order.teardown_outcome === "reassemble" ? "The customer declined repair after teardown and requested reassembly." : "The customer declined repair and reassembly after teardown."}</Text>
      </View>}
      {invoice.notes && <View style={s.section}><Text style={s.subheading} minPresenceAhead={30}>Notes</Text><Text>{invoice.notes}</Text></View>}
      <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `Keep this invoice for your records. · ${number} · Page ${pageNumber} of ${totalPages}`} />
    </Page>
  </Document>;
}

export async function renderInvoicePdf(data: InvoicePdfData) {
  return renderToBuffer(<InvoicePdf data={data} />);
}
