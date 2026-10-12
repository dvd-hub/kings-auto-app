import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

/** Page through aggregate inputs rather than silently stopping at the API row limit. */
export async function readAll<T>(query: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>) {
  const data: T[] = [];
  for (let start = 0; ; start += 1000) {
    const result = await query(start, start + 999);
    if (result.error) return { data: [], error: result.error };
    const page = result.data ?? [];
    data.push(...page);
    if (page.length < 1000) return { data, error: null };
  }
}
