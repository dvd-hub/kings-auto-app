"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";
import { addActivity } from "@/app/(app)/customers/actions";
import type { FieldErrors } from "@/lib/validation";

export function ActivityForm({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const k = useTranslations("activityKind");
  const e = useTranslations("errors");
  const c = useTranslations("common");
  const router = useRouter();
  const [kind, setKind] = useState<"note" | "call">("note");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await addActivity({ customer_id: customerId, kind, body });
      if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(e("save")); return; }
      setBody("");
      setErrors({});
      toast.success(t("entrySaved"));
      router.refresh();
    });
  }

  return <form noValidate onSubmit={submit} className="space-y-3">
    <Field id="activity-kind" label={t("entryKind")}>
      <Select id="activity-kind" value={kind} onChange={(event) => setKind(event.target.value === "call" ? "call" : "note")}>
        <option value="note">{k("note")}</option>
        <option value="call">{k("call")}</option>
      </Select>
    </Field>
    <Field id="body" label={t("entryBody")} error={errors.body}>
      <Textarea {...fieldAria("body", errors.body)} value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} />
    </Field>
    <Button type="submit" variant="outline" disabled={pending}>{pending ? c("saving") : t("addEntryButton")}</Button>
  </form>;
}
