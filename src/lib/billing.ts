import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { RoBalance } from "@/lib/payments";
import { readAll } from "@/lib/supabase/read-all";

export function getBillingBalances(supabase: SupabaseClient<Database>) {
  // ro_balances already excludes soft-deleted orders, invoices and payments.
  return readAll((start, end) => supabase.from("ro_balances").select("*")
    .in("payment_status", ["unpaid", "partial", "overpaid", "deposit"])
    .order("repair_order_id").range(start, end));
}

export function totalPending(balances: RoBalance[]): number {
  return balances.filter(row => row.payment_status === "unpaid" || row.payment_status === "partial")
    .reduce((total, row) => total + (row.balance_cents ?? 0), 0);
}
