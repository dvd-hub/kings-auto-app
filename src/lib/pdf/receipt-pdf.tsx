import "server-only";
/* react-pdf Image does not expose HTML alt attributes. */
/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Database } from "@/lib/database.types";
import type { Invoice } from "@/lib/invoices";
import type { RepairOrder } from "@/lib/orders";
import type { Payment } from "@/lib/payments";
import { formatDateTime, formatInvoiceNumber, formatMoney, formatPaymentNumber, formatPhone, formatRoNumber } from "@/lib/format";
import { customerName, vehicleLabel } from "@/lib/customers";
import { SHOP_TIMEZONE } from "@/lib/config";
import { pdfAddress, pdfLogo, pdfStyles as s } from "./estimate-pdf";
import en from "../../../messages/en.json";

type Tables = Database["public"]["Tables"];
export type ReceiptPdfData = {
  shop: Tables["shops"]["Row"];
  order: RepairOrder;
  payment: Payment;
  invoice: Invoice | null;
  customer: Tables["customers"]["Row"];
  vehicle: Tables["vehicles"]["Row"];
  paidToDateCents: number;
};

// Match the invoice's centered, diagonal VOID watermark on every letter page.
const receiptStyles = StyleSheet.create({
  watermarkPage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: 612, height: 792, justifyContent: "center", alignItems: "center" },
  watermark: { fontFamily: "Barlow", fontSize: 120, fontWeight: 700, lineHeight: 1, color: s.ro.color, opacity: 0.12, transform: "rotate(-35deg)" },
});

function ReceiptPdf({ data }: { data: ReceiptPdfData }) {
  const { shop, order, payment, invoice, customer, vehicle, paidToDateCents } = data;
  const number = formatPaymentNumber(payment.payment_number);
  const title = payment.kind === "refund" ? "REFUND RECEIPT" : "PAYMENT RECEIPT";
  return <Document title={`${title} ${number} · ${formatRoNumber(order.ro_number)}`} author={shop.legal_name || shop.name} language="en-US">
    <Page size="LETTER" style={s.page}>
      {payment.status === "voided" && <View fixed wrap={false} style={receiptStyles.watermarkPage}><Text style={receiptStyles.watermark}>VOID</Text></View>}
      <View style={s.header} wrap={false}><Image style={s.logo} src={pdfLogo} /><View style={s.shopDetails}>
        <Text style={s.shopName}>{shop.legal_name || shop.name}</Text><Text>{pdfAddress(shop)}</Text>
        {shop.phone && <Text>{formatPhone(shop.phone)}</Text>}
        <Text>BAR Registration No. {shop.bar_registration_number || "—"}</Text>
      </View></View>
      <View style={s.section}><Text style={s.heading}>{title}</Text>
        {payment.status === "voided" && <Text>Void reason: {payment.void_reason}</Text>}
        <Text style={s.ro}>{number} · {formatRoNumber(order.ro_number)}{invoice && ` · ${formatInvoiceNumber(invoice.invoice_number!)}`}</Text>
        <Text>Payment date: {formatDateTime(payment.paid_at)} ({SHOP_TIMEZONE})</Text>
      </View>
      <View style={s.section}><Text style={s.subheading}>Customer and vehicle</Text><Text>{customerName(customer)}</Text>
        <Text>{[customer.phone ? formatPhone(customer.phone) : null, customer.email].filter(Boolean).join(" · ")}</Text>
        <Text>{vehicleLabel(vehicle)}</Text><Text style={s.mono}>VIN: {vehicle.vin || "—"}</Text>
      </View>
      <View style={s.section}><Text style={s.subheading} minPresenceAhead={70}>Transaction details</Text>
        <Text>Payer: {en.payments.payer[payment.payer]}</Text>
        {payment.payer_name && <Text>Payer name: {payment.payer_name}</Text>}
        {payment.claim_number && <Text>Claim number: {payment.claim_number}</Text>}
        <Text>Method: {en.payments.method[payment.method]}</Text>
        {payment.reference && <Text>Reference: {payment.reference}</Text>}
        <Text style={s.total}>{payment.kind === "refund" ? "REFUND" : "PAYMENT"} {formatMoney(payment.amount_cents)}</Text>
      </View>
      <View style={s.section} wrap={false}><Text style={s.subheading}>Account summary</Text>
        {invoice ? <>
          <Text style={s.subtotal}>Invoice total: {formatMoney(invoice.total_cents!)}</Text>
          <Text style={s.subtotal}>Paid to date: {formatMoney(paidToDateCents)}</Text>
          <Text style={s.subtotal}>Balance due: {formatMoney(invoice.total_cents! - paidToDateCents)}</Text>
        </> : <>
          <Text>Deposit received toward future invoice</Text>
          <Text style={s.subtotal}>Deposits to date: {formatMoney(paidToDateCents)}</Text>
        </>}
      </View>
      {payment.notes && <View style={s.section} wrap={false}><Text style={s.subheading}>Notes</Text><Text>{payment.notes}</Text></View>}
      <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `Thank you for your business. · ${number} · Page ${pageNumber} of ${totalPages}`} />
    </Page>
  </Document>;
}

export async function renderReceiptPdf(data: ReceiptPdfData) {
  return renderToBuffer(<ReceiptPdf data={data} />);
}
