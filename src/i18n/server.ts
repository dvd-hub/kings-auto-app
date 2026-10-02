import { cookies } from "next/headers";
import { createTranslator } from "next-intl";
import { getAppMessages } from "@/i18n/messages";
import { SHOP_TIMEZONE } from "@/lib/config";

export async function getLocale(): Promise<"en" | "es"> {
  return (await cookies()).get("locale")?.value === "es" ? "es" : "en";
}

export async function getT() {
  const locale = await getLocale();
  return createTranslator({ locale, messages: await getAppMessages(locale), timeZone: SHOP_TIMEZONE });
}
