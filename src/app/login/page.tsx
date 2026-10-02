"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const t = useTranslations("auth");
  const methods = useForm();
  const c = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const setError = (message: string) => { if (message) toast.error(message); };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link") toast.error(t("linkError"), { id: "link-error" });
  }, [t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { error } = await createClient().auth.signInWithPassword({
        email: String(form.get("email")), password: String(form.get("password")),
      });
      if (error) setError(t("loginError"));
      else { router.replace("/"); router.refresh(); }
    } catch { setError(c("configurationError")); }
    finally { setBusy(false); }
  }

  return <AuthShell title={t("loginTitle")} description={t("loginDescription")}>
    <Form {...methods}><form onSubmit={submit} className="space-y-4">
      <div><Label htmlFor="email" className="mb-1">{c("email")}</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
      <div><Label htmlFor="password" className="mb-1">{c("password")}</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      <Button type="submit" disabled={busy} className="w-full">{busy ? c("loading") : t("loginButton")}</Button>
    </form></Form>
    <Link href="/forgot-password" className="mt-5 flex min-h-11 items-center justify-center text-link underline hover:text-link-hover">{t("forgotLink")}</Link>
  </AuthShell>;
}
