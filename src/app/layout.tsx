import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Barlow, Barlow_Semi_Condensed, IBM_Plex_Mono } from "next/font/google";
import { getAppMessages } from "@/i18n/messages";
import { IntlProvider } from "@/components/intl-provider";
import en from "../../messages/en.json";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";


const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap" });
const barlowSemi = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow-semi", display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-ibm-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: en.common.brand,
  description: en.common.brand,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await cookies()).get("locale")?.value === "es" ? "es" : "en";
  const messages = await getAppMessages(locale);

  return (
    <html lang={locale} className={`${barlow.variable} ${barlowSemi.variable} ${ibmPlexMono.variable}`}>
      <body>
        <IntlProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
        </IntlProvider>
      </body>
    </html>
  );
}
