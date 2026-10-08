"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Field, Select, Textarea, fieldAria } from "@/components/form-field";
import { editableOrderStatuses, type OrderStatus } from "@/lib/orders";
import type { FieldErrors } from "@/lib/validation";
import { changeOrderStatus, addOrderActivity } from "@/app/(app)/orders/actions";
import { createEstimate } from "@/app/(app)/orders/estimate-actions";

export function OrderStatusSelector({ id, status }: { id: string; status: OrderStatus }) {
  const t = useTranslations();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  function change(next: typeof editableOrderStatuses[number]) {
    start(async () => {
      const result = await changeOrderStatus({ id, status: next });
      if (!result.ok) { toast.error(t(`errors.${result.error ?? "save"}`)); return; }
      setConfirm(false);
      if (result.warning) toast.warning(t(`errors.${result.warning}`)); else toast.success(t("orders.statusSaved"));
      router.refresh();
    });
  }
  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={pending}>{t("orders.changeStatus")}</Button></DropdownMenuTrigger>
      <DropdownMenuContent>{editableOrderStatuses.map((value) => <DropdownMenuItem key={value} className="min-h-11" disabled={value === status} onSelect={() => value === "cancelled" ? setConfirm(true) : change(value)}>{t(`ro_status.${value}`)}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent showCloseButton={false}>
      <DialogTitle>{t("orders.cancelTitle")}</DialogTitle><DialogDescription>{t("orders.cancelText")}</DialogDescription>
      <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setConfirm(false)}>{t("common.cancel")}</Button><Button variant="destructive" disabled={pending} onClick={() => change("cancelled")}>{t("orders.confirmCancel")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

export function NewEstimateButtons({ orderId, disabled }: { orderId: string; disabled: boolean }) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  return <div className="flex flex-wrap gap-2">{(["teardown", "repair"] as const).map((kind) => <Button key={kind} variant="outline" disabled={disabled || pending} onClick={() => start(async () => {
    const result = await createEstimate({ orderId, kind });
    if (!result.ok) toast.error(t(`errors.${result.error ?? "save"}`));
  })}>{t(kind === "teardown" ? "orders.newTeardown" : "orders.newRepair")}</Button>)}</div>;
}

export function OrderActivityForm({ orderId }: { orderId: string }) {
  const t = useTranslations();
  const [kind, setKind] = useState("note");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  return <form noValidate className="space-y-3" onSubmit={(event) => {
    event.preventDefault(); start(async () => {
      const result = await addOrderActivity({ repair_order_id: orderId, kind, body });
      if (!result.ok) { setErrors(result.fieldErrors ?? {}); if (result.error) toast.error(t(`errors.${result.error}`)); return; }
      setBody(""); setErrors({}); toast.success(t("customers.entrySaved"));
    });
  }}>
    <Field id="kind" label={t("customers.entryKind")} error={errors.kind}><Select {...fieldAria("kind", errors.kind)} value={kind} onChange={(e) => setKind(e.target.value)}><option value="note">{t("activityKind.note")}</option><option value="call">{t("activityKind.call")}</option></Select></Field>
    <Field id="body" label={t("customers.entryBody")} error={errors.body}><Textarea {...fieldAria("body", errors.body)} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
    <Button variant="outline" disabled={pending}>{pending ? t("common.saving") : t("customers.addEntryButton")}</Button>
  </form>;
}
