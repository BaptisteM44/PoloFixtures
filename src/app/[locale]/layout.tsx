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
    title: { default: t("og_title"), template: `%s | PoloFixtures` },
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
            <footer
              style={{
                borderTop: "1px solid var(--border-light)",
                padding: "16px 24px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 16,
                marginTop: 40,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                PoloFixtures © {new Date().getFullYear()}
              </span>
              <span style={{ color: "var(--border)", fontSize: 12 }}>·</span>
              <LanguageSwitcher />
              <span style={{ color: "var(--border)", fontSize: 12 }}>·</span>
              <ContactAdminModal />
            </footer>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
