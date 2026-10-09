"use client";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function SignatureCanvas({ onChange, disabled }: { onChange: (png: string) => void; disabled: boolean }) {
  const t = useTranslations(), canvas = useRef<HTMLCanvasElement>(null), drawing = useRef(false), last = useRef<{ x: number; y: number } | null>(null);
  function point(event: React.PointerEvent<HTMLCanvasElement>) { const r = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - r.left) * 900 / r.width, y: (event.clientY - r.top) * 300 / r.height }; }
  function finish() { if (!drawing.current) return; drawing.current = false; last.current = null; onChange(canvas.current?.toDataURL("image/png") ?? ""); }
  return <div className="space-y-2"><canvas ref={canvas} width={900} height={300} aria-label={t("authorization.signature")} className="h-40 w-full touch-none rounded-control border border-input bg-surface" onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = point(e); }} onPointerMove={(e) => {
    if (!drawing.current || disabled || !last.current) return;
    const ctx = e.currentTarget.getContext("2d"), p = point(e);
    if (ctx) { ctx.strokeStyle = getComputedStyle(e.currentTarget).color; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    last.current = p;
  }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} /><Button type="button" variant="outline" disabled={disabled} onClick={() => { canvas.current?.getContext("2d")?.clearRect(0, 0, 900, 300); onChange(""); }}>{t("authorization.clear")}</Button></div>;
}

