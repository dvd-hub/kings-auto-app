import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>(["invite", "recovery"]);

function safeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/reset-password";
  return next;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const failure = NextResponse.redirect(new URL("/login?error=link", request.url));

  if (!tokenHash || !type || !allowedTypes.has(type)) return failure;

  const destination = new URL(safeNext(params.get("next")), request.url);
  if (destination.origin !== request.nextUrl.origin) return failure;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return failure;
  } catch {
    return failure;
  }
  return NextResponse.redirect(destination);
}
