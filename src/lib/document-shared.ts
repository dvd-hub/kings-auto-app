import type { Database } from "@/lib/database.types";

export type OrderDocument = Database["public"]["Tables"]["documents"]["Row"];
export type SignedDocument = OrderDocument & { url: string | null };
export type Authorization = Database["public"]["Tables"]["authorizations"]["Row"];
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] as const;
export const documentExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };
export function documentName(document: Pick<OrderDocument, "storage_path" | "caption">) { return document.caption || document.storage_path.split("/").pop() || ""; }
