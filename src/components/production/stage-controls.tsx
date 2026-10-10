"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moveProductionStage } from "@/app/(app)/production/actions";

type Stage = { id: string; name: string };

export function StageControls({ orderId, ro, previous, next }: {
  orderId: string;
  ro: string;
  previous: Stage | null;
  next: Stage | null;
}) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  function move(stage: Stage) {
    start(async () => {
      try {
        const result = await moveProductionStage({ id: orderId, production_stage_id: stage.id });
        if (!result.ok) { toast.error(t(`errors.${result.error ?? "save"}`)); return; }
        if (result.warning) toast.warning(t(`errors.${result.warning}`));
        else toast.success(t("production.moved", { ro, stage: stage.name }));
      } catch { toast.error(t("errors.save")); }
    });
  }
  return <div className="flex justify-between gap-3 border-t border-border p-3" aria-busy={pending}>
    <Button type="button" variant="outline" className="min-h-11 min-w-11 px-3" disabled={pending || !previous}
      aria-label={previous ? t("production.movePrevious", { ro, stage: previous.name }) : t("production.noPrevious", { ro })}
      onClick={() => previous && move(previous)}><span aria-hidden="true">{t("production.previousSymbol")}</span></Button>
    <Button type="button" variant="outline" className="min-h-11 min-w-11 px-3" disabled={pending || !next}
      aria-label={next ? t("production.moveNext", { ro, stage: next.name }) : t("production.noNext", { ro })}
      onClick={() => next && move(next)}><span aria-hidden="true">{t("production.nextSymbol")}</span></Button>
  </div>;
}
