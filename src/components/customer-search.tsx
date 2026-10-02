"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { customerName, type Customer } from "@/lib/customers";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CustomerOption = Pick<Customer, "id" | "type" | "first_name" | "last_name" | "company_name" | "phone" | "email">;

/** Accessible combobox over rpc("search_customers"): 250 ms debounce, min 2 chars, up to 8 results. */
export function CustomerSearch({ label, placeholder, onSelect, showCreate = false, className, inputClassName, autoFocus }: {
  label: string; placeholder?: string; onSelect: (customer: CustomerOption) => void; showCreate?: boolean;
  className?: string; inputClassName?: string; autoFocus?: boolean;
}) {
  const t = useTranslations("search");
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const request = useRef(0);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const current = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await createClient().rpc("search_customers", { q: term })
          .select("id, type, first_name, last_name, company_name, phone, email").limit(8);
        if (current === request.current) { setResults(data ?? []); setActive(-1); }
      } catch {
        if (current === request.current) setResults([]);
      } finally {
        if (current === request.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);

  const visible = open && term.length >= 2;
  const shown = term.length >= 2 ? results : [];

  function choose(customer: CustomerOption) {
    setOpen(false);
    setQuery("");
    setResults([]);
    onSelect(customer);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, shown.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === "Enter") {
      if (visible && shown.length > 0) { event.preventDefault(); choose(shown[Math.max(active, 0)]); }
    } else if (event.key === "Escape") { setOpen(false); setActive(-1); }
  }

  return <div className={cn("relative", className)}>
    <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-secondary-foreground" aria-hidden />
    <Input type="search" role="combobox" aria-label={label} placeholder={placeholder} value={query} autoFocus={autoFocus}
      aria-expanded={visible} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={visible && active >= 0 && shown[active] ? `${listId}-${active}` : undefined}
      onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
      onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKeyDown}
      className={cn("pl-10", inputClassName)} />
    {visible && <div className="absolute top-full right-0 left-0 z-40 mt-1 overflow-hidden rounded-card border border-border bg-surface shadow-lg">
      <ul id={listId} role="listbox" aria-label={label} className="max-h-96 overflow-y-auto py-1">
        {shown.map((c, i) => <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
          onMouseDown={(e) => e.preventDefault()} onClick={() => choose(c)} onMouseEnter={() => setActive(i)}
          className={cn("flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5", i === active && "bg-muted")}>
          <span className="font-semibold text-foreground">{customerName(c)}</span>
          <span className="text-sm text-secondary-foreground">{c.phone ? formatPhone(c.phone) : c.email}</span>
        </li>)}
      </ul>
      <p className="sr-only" role="status">{loading ? t("searching") : t("results", { count: shown.length })}</p>
      {!loading && shown.length === 0 && <div className="px-3 py-2">
        <p className="text-secondary-foreground">{loading ? t("searching") : t("noResults")}</p>
        {showCreate && <Link href={`/customers/new?q=${encodeURIComponent(term)}`} onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen(false)} className="flex min-h-11 items-center font-semibold text-link underline hover:text-link-hover">{t("create")}</Link>}
      </div>}
    </div>}
  </div>;
}
