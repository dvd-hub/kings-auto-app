import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ReceiptPdfData } from "./receipt-pdf";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadReceiptPdfData(client: Client, orderId: string, paymentId: string): Promise<ReceiptPdfData> {
  const [order, payment, invoice] = await Promise.all([
    client.from("repair_orders").select("*,customers(*),vehicles(*)").eq("id", orderId).is("deleted_at", null).maybeSingle(),
    client.from("payments").select("*").eq("id", paymentId).eq("repair_order_id", orderId).is("deleted_at", null).maybeSingle(),
    client.from("invoices").select("*").eq("repair_order_id", orderId).eq("status", "issued").is("deleted_at", null).maybeSingle(),
  ]);
  if (order.error || payment.error || invoice.error) throw new Error("load");
  if (!order.data?.customers || !order.data.vehicles || !payment.data) throw new Error("notFound");
  if (invoice.data && (invoice.data.total_cents === null || invoice.data.invoice_number === null)) throw new Error("load");

  const [shop, paidToDateCents] = await Promise.all([
    client.from("shops").select("*").eq("id", order.data.shop_id).is("deleted_at", null).single(),
    (async () => {
      let netPaidCents = 0;
      // Use the receipt's sequence, not paid_at or today's RO balance. Backdated
      // payments and subsequent transactions must not change this cutoff.
      for (let offset = 0; ; offset += 1000) {
        const result = await client.from("payments").select("kind,amount_cents")
          .eq("repair_order_id", orderId).eq("status", "recorded").is("deleted_at", null)
          .lte("payment_number", payment.data!.payment_number).order("payment_number").range(offset, offset + 999);
        if (result.error) throw new Error("load");
        for (const row of result.data) netPaidCents += row.kind === "refund" ? -row.amount_cents : row.amount_cents;
        if (result.data.length < 1000) return netPaidCents;
      }
    })(),
  ]);
  if (shop.error || !shop.data) throw new Error("load");
  return {
    shop: shop.data, order: order.data, payment: payment.data, invoice: invoice.data,
    customer: order.data.customers, vehicle: order.data.vehicles, paidToDateCents,
  };
}
