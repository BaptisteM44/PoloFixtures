import "@/styles/globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, Chakra_Petch } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import SessionProvider from "@/components/SessionProvider";
import { Header } from "@/components/Header";
import { ContactAdminModal } from "@/components/ContactAdminModal";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SpeedInsights } from "@vercel/speed-insights/next";

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

  return (
    <html lang={locale} className={`${space.variable} ${chakra.variable}`}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <SessionProvider>
            <Header />
            <main className="page">{children}</main>
            <footer className="site-footer">
              <div className="site-footer__links">
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Poloperator © {new Date().getFullYear()}
                </span>
                <span className="site-footer__sep">·</span>
                <a href="/legal/mentions" style={{ fontSize: 12, color: "var(--text-muted)" }}>Mentions légales</a>
                <span className="site-footer__sep">·</span>
                <a href="/legal/privacy" style={{ fontSize: 12, color: "var(--text-muted)" }}>Confidentialité</a>
                <span className="site-footer__sep">·</span>
                <a href="/legal/terms" style={{ fontSize: 12, color: "var(--text-muted)" }}>CGU</a>
                <span className="site-footer__sep">·</span>
                <a href="/legal/charter" style={{ fontSize: 12, color: "var(--text-muted)" }}>Charte</a>
                <span className="site-footer__sep">·</span>
                <LanguageSwitcher />
                <span className="site-footer__sep">·</span>
                <ContactAdminModal />
              </div>
            </footer>
          </SessionProvider>
        </NextIntlClientProvider>
        <SpeedInsights />
        <script defer src="https://cloud.umami.is/script.js" data-website-id="7cfea7de-a1f5-4085-a45a-886bb62a83fe" />
      </body>
    </html>
  );
}
