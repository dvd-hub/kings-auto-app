"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { customerName } from "@/lib/customers";
import { customerSchema, fieldErrors, type FieldErrors } from "@/lib/validation";
import { Constants } from "@/lib/database.types";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error?: string; fieldErrors?: FieldErrors; duplicates?: { id: string; name: string }[] };

const id = z.uuid();

export async function saveCustomer(customerId: string | null, input: unknown, force = false): Promise<ActionResult> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  if (customerId !== null && !id.safeParse(customerId).success) return { ok: false, error: "notFound" };
  const data = parsed.data;
  const supabase = await createClient();

  if (customerId === null && !force) {
    const matches = new Map<string, string>();
    for (const [column, value] of [["phone", data.phone], ["email", data.email]] as const) {
      if (!value) continue;
      const { data: rows } = await supabase.from("customers").select("id, type, first_name, last_name, company_name")
        .is("deleted_at", null).eq(column, value).limit(5);
      rows?.forEach((row) => matches.set(row.id, customerName(row)));
    }
    if (matches.size > 0) return { ok: false, duplicates: [...matches].map(([dupId, name]) => ({ id: dupId, name })) };
  }

  if (customerId === null) {
    const { data: row, error } = await supabase.from("customers").insert(data).select("id").single();
    if (error || !row) return { ok: false, error: "save" };
    revalidatePath("/customers");
    return { ok: true, id: row.id };
  }
  const { data: row, error } = await supabase.from("customers").update(data).eq("id", customerId).is("deleted_at", null).select("id").single();
  if (error || !row) return { ok: false, error: "save" };
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, id: row.id };
}

export async function archiveCustomer(customerId: string): Promise<ActionResult> {
  if (!id.safeParse(customerId).success) return { ok: false, error: "notFound" };
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("customers").update({ deleted_at: new Date().toISOString() })
    .eq("id", customerId).is("deleted_at", null).select("id").single();
  if (error || !row) return { ok: false, error: "save" };
  revalidatePath("/customers");
  return { ok: true, id: row.id };
}

const activitySchema = z.object({
  customer_id: z.uuid(),
  kind: z.enum(Constants.public.Enums.activity_kind).refine((k) => k === "note" || k === "call", "required"),
  body: z.string().trim().min(1, "required").max(5000),
});

export async function addActivity(input: unknown): Promise<ActionResult> {
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("activities").insert(parsed.data).select("id").single();
  if (error || !row) return { ok: false, error: "save" };
  revalidatePath(`/customers/${parsed.data.customer_id}`);
  return { ok: true, id: row.id };
}
