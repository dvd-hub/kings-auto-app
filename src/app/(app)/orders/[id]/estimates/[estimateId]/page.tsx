import { notFound } from "next/navigation";
import { z } from "zod";
import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { customerName } from "@/lib/customers";
import { EstimateBuilder } from "@/components/orders/estimate-builder";
import { loadSupplementContext } from "@/lib/supplements";
import { estimateLinkStatus } from "@/lib/estimate-links";
import { signedDocuments } from "@/lib/documents";

export default async function EstimatePage({ params }: { params: Promise<{ id: string; estimateId: string }> }) {
  const { id, estimateId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(estimateId).success) notFound();
  const t = await getT();
  const supabase = await createClient();
  const [orderResult, estimateResult] = await Promise.all([
    supabase.from("repair_orders").select("*,customers(*)").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("estimates").select("*").eq("id", estimateId).eq("repair_order_id", id).is("deleted_at", null).in("kind", ["teardown", "repair", "supplement"]).maybeSingle(),
  ]);
  if (orderResult.error || estimateResult.error) return <p role="alert">{t("errors.load")}</p>;
  const order = orderResult.data, estimate = estimateResult.data;
  if (!order || !estimate || !order.customers) notFound();
  const [linesResult, totalsResult, shopResult, authResult, docsResult, linkResult] = await Promise.all([
    supabase.from("estimate_lines").select("*").eq("estimate_id", estimateId).is("deleted_at", null).order("position").order("id"),
    supabase.from("estimate_totals").select("*").eq("estimate_id", estimateId).maybeSingle(),
    supabase.from("shops").select("epa_id_number").eq("id", order.shop_id).is("deleted_at", null).maybeSingle(),
    supabase.from("authorizations").select("*").eq("estimate_id", estimateId).is("deleted_at", null).maybeSingle(),
    supabase.from("documents").select("*").eq("estimate_id", estimateId).eq("repair_order_id", id).is("deleted_at", null).in("kind", ["third_party_estimate", "signature", "authorization_proof"]),
    supabase.from("estimate_links").select("id,recipient_email,expires_at,sent_at,opened_at,used_at,revoked_at,created_at").eq("estimate_id", estimateId).is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (linesResult.error || totalsResult.error || shopResult.error || authResult.error || docsResult.error || linkResult.error) return <p role="alert">{t("errors.load")}</p>;
  let documents;
  try { documents = await signedDocuments(supabase, docsResult.data ?? []); } catch { return <p role="alert">{t("errors.documentRead")}</p>; }
  let supplement;
  try { supplement = await loadSupplementContext(supabase, estimate); } catch { return <p role="alert">{t("errors.load")}</p>; }
  return <EstimateBuilder latestLink={linkResult.data} initialLinkStatus={linkResult.data ? estimateLinkStatus(linkResult.data) : null} supplement={supplement} key={`${estimate.id}:${estimate.updated_at}`} estimate={estimate} lines={linesResult.data ?? []} totals={totalsResult.data} order={order} customer={{ id: order.customers.id, name: customerName(order.customers), phone: order.customers.phone, email: order.customers.email }} epaAvailable={Boolean(shopResult.data?.epa_id_number?.trim())} payorDocument={documents.find((d) => d.id === estimate.payor_estimate_document_id) ?? null} authorization={authResult.data} signature={documents.find((d) => d.id === authResult.data?.signature_document_id) ?? null} proofs={documents.filter((d) => d.kind === "authorization_proof")} />;
}
