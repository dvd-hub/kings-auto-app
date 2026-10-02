"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LayoutDashboard, Users, ClipboardList, Columns3, CalendarDays, Filter, Car, Receipt, Settings, Search, Menu, User, X, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";

const links: ReadonlyArray<{ href: string; key: "home" | "customers" | "orders" | "production" | "calendar" | "crm" | "classics" | "billing" | "settings"; icon: LucideIcon }> = [
  { href: "/", key: "home", icon: LayoutDashboard },
  { href: "/customers", key: "customers", icon: Users },
  { href: "/orders", key: "orders", icon: ClipboardList },
  { href: "/production", key: "production", icon: Columns3 },
  { href: "/calendar", key: "calendar", icon: CalendarDays },
  { href: "/crm", key: "crm", icon: Filter },
  { href: "/classics", key: "classics", icon: Car },
  { href: "/billing", key: "billing", icon: Receipt },
  { href: "/settings", key: "settings", icon: Settings },
];

export function AppShell({ children, email }: { children: React.ReactNode; email: string }) {
  const t = useTranslations("navigation");
  const c = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);


  function changeLanguage(nextLocale: "en" | "es") {
    document.cookie = `locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const navigation = <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
    <div className="flex min-h-[112px] items-center px-6">
      <Link href="/" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center" aria-label={c("brand")}>
        <Image src="/logo.png" alt={c("logoAlt")} width={184} height={44} className="h-auto w-[184px]" priority />
      </Link>
    </div>
    <nav className="flex-1 space-y-1 px-3" aria-label={t("main")}>
      {links.map(({ href, key, icon: NavIcon }) => {
        const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
        return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-control px-3 font-medium transition ${active ? "bg-sidebar-active text-sidebar-active-foreground" : "text-sidebar-foreground hover:bg-sidebar-hover"}`}>
          <NavIcon className={`h-5 w-5 shrink-0 ${active ? "text-sidebar-active-icon" : "text-sidebar-foreground"}`} />
          <span>{t(key)}</span>
        </Link>;
      })}
    </nav>
    <div className="border-t border-sidebar-foreground/20 px-6 py-5 text-xs leading-5 text-sidebar-foreground">
      <div className="font-semibold">{c("legalName")}</div>
      <div>{c("location")}</div>
    </div>
  </div>;

  return <Sheet open={open} onOpenChange={setOpen}><div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
    <aside className="hidden h-screen bg-sidebar lg:sticky lg:top-0 lg:block">{navigation}</aside>
    <SheetContent side="left" showCloseButton={false} aria-describedby={undefined} className="gap-0 border-0 bg-sidebar p-0 text-[15px] text-sidebar-foreground data-[side=left]:w-[232px] data-[side=left]:sm:max-w-[232px]">
      <SheetTitle className="sr-only">{t("openMenu")}</SheetTitle>
      <SheetClose asChild><button type="button" className="fixed top-4 left-[240px] z-50 flex h-11 w-11 items-center justify-center rounded-control bg-sidebar text-sidebar-foreground" aria-label={t("closeMenu")}><X className="size-5" /></button></SheetClose>
      {navigation}
    </SheetContent>
    <div className="min-w-0">
      <header className="flex min-h-[72px] items-center gap-3 border-b border-border bg-surface px-4 lg:px-8">
        <SheetTrigger asChild><Button type="button" variant="ghost" className="min-w-11 px-2 lg:hidden" aria-label={t("openMenu")}><Menu className="size-5" /></Button></SheetTrigger>
        <div className="relative min-w-0 max-w-[440px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-secondary-foreground" />
          <Input type="search" aria-label={t("search")} placeholder={t("searchPlaceholder")} className="pl-10" />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div role="group" aria-label={t("language")} className="inline-flex overflow-hidden rounded-control border border-input-border bg-surface">
            <button type="button" onClick={() => changeLanguage("en")} aria-pressed={locale === "en"} className={`min-h-11 min-w-11 px-3 font-semibold ${locale === "en" ? "bg-dark-button text-dark-button-foreground" : "text-foreground hover:bg-app-bg"}`}>{t("languageEnglishShort")}</button>
            <button type="button" onClick={() => changeLanguage("es")} aria-pressed={locale === "es"} className={`min-h-11 min-w-11 border-l border-input-border px-3 font-semibold ${locale === "es" ? "bg-dark-button text-dark-button-foreground" : "text-foreground hover:bg-app-bg"}`}>{t("languageSpanishShort")}</button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="flex h-11 w-11 items-center justify-center rounded-full border border-input-border bg-surface text-foreground hover:bg-app-bg" aria-label={t("userMenu")}><User className="size-5" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 rounded-card border border-border bg-surface p-2 shadow-lg">
              <DropdownMenuLabel className="truncate px-3 py-2 text-sm font-normal text-secondary-foreground">{email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut} className="min-h-11 rounded-control px-3 text-[15px] font-medium">{t("signOut")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] p-8 max-sm:p-5">{children}</main>
    </div>
  </div></Sheet>;
}
