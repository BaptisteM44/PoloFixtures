import "@/styles/globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, Chakra_Petch } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import SessionProvider from "@/components/SessionProvider";
import { auth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
});

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-chakra",
});

type Props = {
  children: React.ReactNode;
  params: { locale: string };
};

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "seo" });
  return {
    title: { default: t("og_title"), template: `%s | Poloperator` },
    description: t("og_description"),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale: string) => ({ locale }));
}

export default async function LocaleLayout({ children, params: { locale } }: Props) {
  // Valide la locale
  if (!routing.locales.includes(locale as "fr" | "en" | "de" | "es")) {
    notFound();
  }

  const messages = await getMessages();
  const session = await auth();

  return (
    <html lang={locale} className={`${space.variable} ${chakra.variable}`}>
      <head>
        {/* Script bloquant : applique le thème AVANT le premier paint pour éviter le flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();` }} />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <SessionProvider session={session}>
            <Header />
            <main className="page">{children}</main>
            <SiteFooter />
          </SessionProvider>
        </NextIntlClientProvider>
        <SpeedInsights />
        <Script defer src="https://cloud.umami.is/script.js" data-website-id="7cfea7de-a1f5-4085-a45a-886bb62a83fe" strategy="afterInteractive" />
      </body>
    </html>
  );
}
