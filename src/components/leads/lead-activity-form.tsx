"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addLeadActivity } from "@/app/(app)/leads/actions";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";

export function LeadActivityForm({ id }: { id: string }) {
  const t = useTranslations("leads"); const c = useTranslations("common"); const e = useTranslations("errors"); const a = useTranslations("activityKind");
  const router = useRouter(); const [kind, setKind] = useState("note"); const [body, setBody] = useState("");
  const [pending, start] = useTransition(); const [errors, setErrors] = useState<Record<string, string>>({});
  return <form noValidate className="space-y-4" onSubmit={event => { event.preventDefault(); start(async () => {
    try {
      const result = await addLeadActivity({ id, kind, body });
      if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(e(result.error)); return; }
      setBody(""); setErrors({}); toast.success(t("entrySaved")); router.refresh();
    } catch { toast.error(e("save")); }
  }); }}>
    <Field id="lead-kind" label={t("entryType")} error={errors.kind}><Select {...fieldAria("lead-kind", errors.kind)} value={kind} onChange={event => setKind(event.target.value)}><option value="note">{a("note")}</option><option value="call">{a("call")}</option></Select></Field>
    <Field id="lead-body" label={t("entryBody")} error={errors.body}><Textarea {...fieldAria("lead-body", errors.body)} value={body} onChange={event => setBody(event.target.value)} /></Field>
    <Button type="submit" variant="outline" disabled={pending}>{pending ? c("saving") : t("addEntry")}</Button>
  </form>;
}
