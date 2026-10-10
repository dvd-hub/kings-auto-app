"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

export function BoardScroller({ children }: { children: ReactNode }) {
  const t = useTranslations("production");
  const id = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, overflow: false });

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    function update() {
      if (!board) return;
      const width = board.scrollWidth;
      const overflow = width > board.clientWidth + 1;
      setSize((current) => current.width === width && current.overflow === overflow ? current : { width, overflow });
    }
    const observer = new ResizeObserver(update);
    observer.observe(board);
    if (board.firstElementChild) observer.observe(board.firstElementChild);
    const frame = requestAnimationFrame(update);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [children]);

  function sync(source: HTMLDivElement, target: HTMLDivElement | null) {
    // Ignore fractional-pixel rounding so the mirrored scroll event stops here.
    if (target && Math.abs(target.scrollLeft - source.scrollLeft) > 1) target.scrollLeft = source.scrollLeft;
  }

  useEffect(() => {
    if (boardRef.current) sync(boardRef.current, scrollbarRef.current);
  }, [size.width, size.overflow]);

  return <div className="w-full min-w-0 space-y-3">
    <div ref={scrollbarRef} hidden={!size.overflow} role="region" aria-label={t("scrollbar")} aria-controls={id} tabIndex={0}
      onScroll={(event) => sync(event.currentTarget, boardRef.current)}
      className="production-scrollbar w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-control focus-visible:outline-2 focus-visible:outline-ring">
      <div className="h-px" style={{ width: size.width }} />
    </div>
    <div ref={boardRef} id={id} role="region" aria-label={t("title")} tabIndex={0}
      onScroll={(event) => sync(event.currentTarget, scrollbarRef.current)}
      className="production-board-viewport w-full min-w-0 overflow-x-auto rounded-card pb-4 focus-visible:outline-2 focus-visible:outline-ring">
      {children}
    </div>
  </div>;
}
