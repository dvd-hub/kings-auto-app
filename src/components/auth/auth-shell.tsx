"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const t = useTranslations("common");
  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-12">
      <div className="w-full max-w-[440px]">
        <Link href="/login" className="mx-auto mb-8 flex min-h-11 w-fit items-center" aria-label={t("brand")}>
          <Image src="/logo.png" alt={t("logoAlt")} width={184} height={44} className="h-auto w-[184px]" priority />
        </Link>
        <Card className="block gap-0 overflow-visible border border-border p-8 text-[15px] shadow-sm ring-0 max-sm:p-6">
          <h1 className="text-foreground">{title}</h1>
          <p className="mt-3 mb-7 text-secondary-foreground">{description}</p>
          {children}
        </Card>
      </div>
    </main>
  );
}
