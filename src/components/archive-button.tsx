"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function ArchiveButton({ title, text, done, redirectTo, action }: {
  title: string; text: string; done: string; redirectTo: string; action: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const c = useTranslations("common");
  const e = useTranslations("errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      const result = await action();
      if (!result.ok) { toast.error(e(result.error === "notFound" ? "notFound" : "save")); return; }
      setOpen(false);
      toast.success(done);
      router.push(redirectTo);
      router.refresh();
    });
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline">{c("archive")}</Button></DialogTrigger>
    <DialogContent>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{text}</DialogDescription>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">{c("cancel")}</Button></DialogClose>
        <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>{pending ? c("archiving") : c("archive")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
