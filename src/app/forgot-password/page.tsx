"use client";

import { useState, type FormEvent } from "react";
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

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const methods = useForm();
  const c = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const setMessage = (message: string) => toast.success(message);
  const setError = (message: string) => { if (message) toast.error(message); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const email = String(new FormData(event.currentTarget).get("email"));
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) setError(t("resetError"));
      else setMessage(t("resetSent"));
    } catch { setError(c("configurationError")); }
    finally { setBusy(false); }
  }

  return <AuthShell title={t("forgotTitle")} description={t("forgotDescription")}>
    <Form {...methods}><form onSubmit={submit} className="space-y-4">
      <div><Label htmlFor="email" className="mb-1">{c("email")}</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
      <Button type="submit" disabled={busy} className="w-full">{busy ? c("loading") : t("sendReset")}</Button>
    </form></Form>
    <Link href="/login" className="mt-5 flex min-h-11 items-center justify-center text-link underline hover:text-link-hover">{t("backToLogin")}</Link>
  </AuthShell>;
}
