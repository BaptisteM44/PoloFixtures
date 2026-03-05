import "@/styles/globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, Chakra_Petch } from "next/font/google";
import SessionProvider from "@/components/SessionProvider";
import { Header } from "@/components/Header";
import { ContactAdminModal } from "@/components/ContactAdminModal";

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space"
});

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-chakra"
});

export const metadata: Metadata = {
  title: "Hardcourt Polo | Tournament Manager",
  description: "Full-stack tournament manager for hardcourt bike polo."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${space.variable} ${chakra.variable}`}>
      <body>
        <SessionProvider>
          <Header />
          <main className="page">{children}</main>
          <footer style={{
            borderTop: "1px solid var(--border-light)",
            padding: "16px 24px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
            marginTop: 40,
          }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              PoloFixtures © {new Date().getFullYear()}
            </span>
            <span style={{ color: "var(--border)", fontSize: 12 }}>·</span>
            <ContactAdminModal />
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
