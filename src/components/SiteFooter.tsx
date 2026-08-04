"use client";

import { useTranslations } from "next-intl";
import { ContactAdminModal } from "./ContactAdminModal";

export function SiteFooter() {
  const t = useTranslations("footer");

  return (
    <footer className="site-footer">
      <div className="site-footer__links">
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t("copyright", { year: new Date().getFullYear() })}
        </span>
        <span className="site-footer__sep">·</span>
        <a href="/legal/mentions" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("legal_mentions")}</a>
        <span className="site-footer__sep">·</span>
        <a href="/legal/privacy" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("privacy")}</a>
        <span className="site-footer__sep">·</span>
        <a href="/legal/terms" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("terms")}</a>
        <span className="site-footer__sep">·</span>
        <a href="/legal/charter" style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("charter")}</a>
        <span className="site-footer__sep">·</span>
        <ContactAdminModal />
        <span className="site-footer__sep">·</span>
        <a
          href="https://www.paypal.com/paypalme/bapmorvan"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: "var(--text-muted)" }}
        >
          ☕ {t("donate")}
        </a>
      </div>
    </footer>
  );
}
