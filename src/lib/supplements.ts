import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Estimate } from "@/lib/orders";

export type SupplementContext = { parent: Pick<Estimate, "id" | "kind" | "seq">; authorizedBefore: number };

/** Only approved amounts on this branch belong in its revised total. */
export async function loadSupplementContext(client: Awaited<ReturnType<typeof createClient>>, estimate: Estimate): Promise<SupplementContext | null> {
  if (estimate.kind !== "supplement") return null;
  const { data: estimates, error } = await client.from("estimates").select("*").eq("repair_order_id", estimate.repair_order_id).is("deleted_at", null);
  if (error || !estimates) throw new Error("load");
  const chain: Estimate[] = [], seen = new Set<string>([estimate.id]);
  let id = estimate.parent_estimate_id;
  while (id) {
    if (seen.has(id)) throw new Error("supplementParentInvalid");
    seen.add(id);
    const parent = estimates.find(e => e.id === id);
    if (!parent || parent.status !== "authorized" || !["repair", "supplement"].includes(parent.kind)) throw new Error("supplementParentInvalid");
    chain.push(parent);
    id = parent.parent_estimate_id;
  }
  if (!chain.length || chain.at(-1)?.kind !== "repair") throw new Error("supplementParentInvalid");
  const { data: authorizations, error: authError } = await client.from("authorizations").select("estimate_id,amount_cents").in("estimate_id", chain.map(e => e.id)).eq("decision", "approved").is("deleted_at", null);
  if (authError || !authorizations || chain.some(e => authorizations.filter(a => a.estimate_id === e.id).length !== 1)) throw new Error("load");
  const authorizedBefore = authorizations.reduce((n, a) => n + a.amount_cents, 0);
  if (!Number.isSafeInteger(authorizedBefore)) throw new Error("invalidMoney");
  return { parent: { id: chain[0].id, kind: chain[0].kind, seq: chain[0].seq }, authorizedBefore };
}
