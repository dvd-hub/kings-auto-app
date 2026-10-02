"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const methods = useForm();
  const c = useTranslations("common");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [invite, setInvite] = useState(false);
  const setError = (message: string) => { if (message) toast.error(message); };

  useEffect(() => {
    async function prepare() {
      try {
        const supabase = createClient();
        const params = new URLSearchParams(window.location.search);
        setInvite(params.get("invite") === "1");
        const code = params.get("code");
        const tokenHash = params.get("token_hash");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState({}, "", "/reset-password");
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (error) throw error;
          window.history.replaceState({}, "", "/reset-password");
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No recovery session");
        setReady(true);
      } catch { toast.error(t("invalidResetLink"), { id: "reset-link" }); }
    }
    void prepare();
  }, [t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password"));
    if (password.length < 6) { setError(t("passwordTooShort")); return; }
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(t("invalidResetLink"));
      else { await supabase.auth.signOut(); setSaved(true); toast.success(t("passwordSaved")); }
    } catch { setError(c("configurationError")); }
    finally { setBusy(false); }
  }

  return <AuthShell title={invite ? t("inviteTitle") : t("resetTitle")} description={t("resetDescription")}>
    {ready && !saved && <Form {...methods}><form onSubmit={submit} className="space-y-4">
      <div><Label htmlFor="password" className="mb-1">{t("newPassword")}</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={6} required /></div>
      <Button type="submit" disabled={busy} className="w-full">{busy ? c("loading") : t("savePassword")}</Button>
    </form></Form>}
    <Link href="/login" className="mt-5 flex min-h-11 items-center justify-center text-link underline hover:text-link-hover">{t("backToLogin")}</Link>
  </AuthShell>;
}
