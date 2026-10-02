import { cookies } from "next/headers";
import { createTranslator } from "next-intl";
import { getAppMessages } from "@/i18n/messages";
import { SHOP_TIMEZONE } from "@/lib/config";

export async function EmptySection({ titleKey }: { titleKey: "home" | "customers" | "orders" | "production" | "calendar" | "crm" | "classics" | "billing" | "settings" }) {
  const locale = (await cookies()).get("locale")?.value === "es" ? "es" : "en";
  const t = createTranslator({ locale, messages: await getAppMessages(locale), namespace: "navigation", timeZone: SHOP_TIMEZONE });
  return <section><h1 className="text-foreground">{t(titleKey)}</h1></section>;
}
