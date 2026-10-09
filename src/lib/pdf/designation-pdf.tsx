import "server-only";
/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, View, Text, Image, renderToBuffer } from "@react-pdf/renderer";
import { pdfStyles as s, pdfAddress, pdfLogo } from "./estimate-pdf";
import { sha256 } from "@/lib/documents";
import { customerName, vehicleLabel } from "@/lib/customers";
import { formatDateTime, formatPhone, formatRoNumber } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";
import en from "../../../messages/en.json";

export async function renderDesignationPdf(client: Awaited<ReturnType<typeof createClient>>, orderId: string) {
  const { data: order, error } = await client.from("repair_orders").select("*,customers(*),vehicles(*)").eq("id", orderId).is("deleted_at", null).maybeSingle();
  if (error || !order?.customers || !order.vehicles || !order.designee_signed_at || !order.designee_signature_document_id) throw new Error("notFound");
  const [shopResult, docResult] = await Promise.all([
    client.from("shops").select("*").eq("id", order.shop_id).is("deleted_at", null).single(),
    client.from("documents").select("*").eq("id", order.designee_signature_document_id).eq("repair_order_id", orderId).is("estimate_id", null).eq("kind", "signature").is("deleted_at", null).single(),
  ]);
  const shop = shopResult.data, doc = docResult.data;
  if (shopResult.error || docResult.error || !shop || !doc || doc.mime_type !== "image/png") throw new Error("documentRead");
  const { data: blob, error: downloadError } = await client.storage.from("documents").download(doc.storage_path);
  if (downloadError || !blob) throw new Error("documentRead");
  const signature = Buffer.from(await blob.arrayBuffer());
  if (sha256(signature) !== doc.sha256) throw new Error("documentRead");
  const t = en.phase3b2;
  return renderToBuffer(<Document title={`${t.designation} · ${formatRoNumber(order.ro_number)}`} author={shop.legal_name || shop.name} language="en-US"><Page size="LETTER" style={s.page}>
    <View style={s.header} wrap={false}><Image style={s.logo} src={pdfLogo} /><View style={s.shopDetails}><Text style={s.shopName}>{shop.legal_name || shop.name}</Text><Text>{pdfAddress(shop)}</Text><Text>{[shop.phone ? formatPhone(shop.phone) : null, shop.email].filter(Boolean).join(" · ")}</Text>{shop.bar_registration_number && <Text>{t.barRegistration.replace("{number}", shop.bar_registration_number)}</Text>}</View></View>
    <View style={s.section}><Text style={[s.heading, { fontSize: 14, lineHeight: 1.3 }]} hyphenationCallback={word => [word]}>{t.designationTitle}</Text><Text style={s.ro}>{formatRoNumber(order.ro_number)}</Text><Text>{t.designationText}</Text></View>
    <View style={s.section}><Text style={s.subheading}>{t.designationCustomerVehicle}</Text><Text>{customerName(order.customers)}</Text><Text>{pdfAddress(order.customers)}</Text><Text>{vehicleLabel(order.vehicles)}</Text><Text style={s.mono}>{en.vehicles.vin}: {order.vehicles.vin || "—"}</Text></View>
    <View style={s.section}><Text>{t.designeeName}: {order.designee_name}</Text>{order.designee_phone && <Text>{t.designeePhone}: {formatPhone(order.designee_phone)}</Text>}{order.designee_email && <Text>{t.designeeEmail}: {order.designee_email}</Text>}<Text>{t.designationConfirmation}</Text></View>
    <View style={s.section} wrap={false}><Text style={s.subheading}>{t.customerSignature}</Text><Text>{formatDateTime(order.designee_signed_at)} (America/Los_Angeles)</Text><Image style={s.signature} src={{ data: signature, format: "png" }} /><Text style={s.hash}>{doc.sha256}</Text></View>
    <View style={s.footer} fixed />
  </Page></Document>);
}
