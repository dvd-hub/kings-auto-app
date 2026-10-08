import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type WebRequestRow = Database["public"]["Tables"]["web_requests"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

export type WebRequestDetail = Pick<WebRequestRow,
  | "id" | "status" | "created_at" | "locale" | "service" | "damage_description"
  | "is_insurance_claim" | "insurer_name" | "claim_number" | "preferred_date"
  | "preferred_window" | "marketing_opt_in" | "utm_source" | "utm_medium"
  | "utm_campaign" | "landing_page" | "referrer"
> & {
  hasMetaAd: boolean;
  photos: (Pick<DocumentRow, "id" | "storage_path" | "mime_type" | "size_bytes" | "created_at"> & { url: string | null })[];
};

export async function getWebRequestDetail(appointmentId: string): Promise<WebRequestDetail | null> {
  const supabase = await createClient();
  const { data: request, error } = await supabase.from("web_requests")
    .select("id, status, created_at, locale, service, damage_description, is_insurance_claim, insurer_name, claim_number, preferred_date, preferred_window, marketing_opt_in, utm_source, utm_medium, utm_campaign, fbclid, landing_page, referrer")
    .eq("appointment_id", appointmentId).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!request) return null;

  const { data: documents, error: documentsError } = await supabase.from("documents")
    .select("id, storage_path, mime_type, size_bytes, created_at")
    .eq("web_request_id", request.id).is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (documentsError) throw documentsError;

  const photos = (documents ?? []).map((document) => ({ ...document, url: null as string | null }));
  if (photos.length > 0) {
    // A missing object or a storage outage must not hide the original request.
    try {
      const paths = photos.map((photo) => photo.storage_path);
      const { data: signed } = await supabase.storage.from("documents").createSignedUrls(paths, 3600);
      const urls = new Map(signed?.map((item) => [item.path, item.error ? null : item.signedUrl]));
      for (const photo of photos) photo.url = urls.get(photo.storage_path) || null;
    } catch { /* Keep unavailable photos with a null URL. */ }
  }

  const { fbclid, ...detail } = request;
  return { ...detail, hasMetaAd: Boolean(fbclid), photos };
}
