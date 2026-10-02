"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeVin } from "@/lib/vin";
import { fieldErrors, vehicleSchema, type FieldErrors } from "@/lib/validation";

export type VehicleResult =
  | { ok: true; id: string; customerId: string }
  | { ok: false; error?: string; fieldErrors?: FieldErrors; vinOwnerId?: string };

const id = z.uuid();

async function vinOwner(vin: string): Promise<string | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select("customer_id").eq("vin", vin).is("deleted_at", null).limit(1).maybeSingle();
  return data?.customer_id;
}

/** Creates a vehicle when `vehicleId` is null (then `customerId` is required), otherwise updates it. */
export async function saveVehicle(vehicleId: string | null, customerId: string | null, input: unknown): Promise<VehicleResult> {
  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();

  let result;
  if (vehicleId === null) {
    if (!id.safeParse(customerId).success) return { ok: false, error: "notFound" };
    const { data: owner } = await supabase.from("customers").select("id").eq("id", customerId!).is("deleted_at", null).maybeSingle();
    if (!owner) return { ok: false, error: "notFound" };
    result = await supabase.from("vehicles").insert({ ...parsed.data, customer_id: owner.id }).select("id, customer_id").single();
  } else {
    if (!id.safeParse(vehicleId).success) return { ok: false, error: "notFound" };
    result = await supabase.from("vehicles").update(parsed.data).eq("id", vehicleId).is("deleted_at", null).select("id, customer_id").single();
  }

  if (result.error || !result.data) {
    if (result.error?.code === "23505" && parsed.data.vin) {
      return { ok: false, fieldErrors: { vin: "vinExists" }, vinOwnerId: await vinOwner(parsed.data.vin) };
    }
    return { ok: false, error: "save" };
  }
  revalidatePath(`/customers/${result.data.customer_id}`);
  revalidatePath("/customers");
  return { ok: true, id: result.data.id, customerId: result.data.customer_id };
}

export async function archiveVehicle(vehicleId: string): Promise<VehicleResult> {
  if (!id.safeParse(vehicleId).success) return { ok: false, error: "notFound" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicles").update({ deleted_at: new Date().toISOString() })
    .eq("id", vehicleId).is("deleted_at", null).select("id, customer_id").single();
  if (error || !data) return { ok: false, error: "save" };
  revalidatePath(`/customers/${data.customer_id}`);
  revalidatePath("/customers");
  return { ok: true, id: data.id, customerId: data.customer_id };
}

export type DecodeResult = { ok: true; year: string; make: string; model: string; trim: string } | { ok: false };

export async function decodeVin(raw: string): Promise<DecodeResult> {
  const vin = normalizeVin(String(raw));
  if (!/^[A-Z0-9]{5,17}$/.test(vin)) return { ok: false };
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, {
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { Results?: Record<string, string | null>[] };
    const r = json.Results?.[0];
    if (!r || (!r.Make && !r.Model)) return { ok: false };
    const clean = (v: string | null | undefined) => (v ?? "").trim();
    return { ok: true, year: clean(r.ModelYear), make: clean(r.Make), model: clean(r.Model), trim: clean(r.Trim) };
  } catch {
    return { ok: false };
  }
}
