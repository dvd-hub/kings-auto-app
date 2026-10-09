import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";

// A bounded, per-process guard. Production also needs a shared limit at the host.
const buckets = new Map<string, { count: number; until: number }>();
export function requestIp(headers: Headers): string | null {
  const value = (headers.get("x-nf-client-connection-ip") ?? headers.get("x-forwarded-for")?.split(",")[0])?.trim();
  return value && isIP(value) ? value : null;
}

export function allowEstimateLinkRequest(scope: string, identity: string, limit: number): boolean {
  const now = Date.now();
  const key = createHash("sha256").update(`${scope}:${identity}`).digest("hex");
  const current = buckets.get(key);
  if (current && current.until > now) return ++current.count <= limit;
  for (const [oldKey, bucket] of buckets) if (bucket.until <= now) buckets.delete(oldKey);
  if (buckets.size >= 10_000) return false;
  buckets.set(key, { count: 1, until: now + 60_000 });
  return true;
}
